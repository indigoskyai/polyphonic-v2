import {
  KIMI_K3_MODEL_ID,
  MODEL_CAPABILITIES,
} from '../shared/modelCapabilities.ts';

const fallback = MODEL_CAPABILITIES[KIMI_K3_MODEL_ID];
const modelsResponse = await fetch('https://openrouter.ai/api/v1/models');
if (!modelsResponse.ok) {
  throw new Error(`OpenRouter model discovery failed (${modelsResponse.status})`);
}
const models = await modelsResponse.json();
const live = models?.data?.find((model) => model.id === KIMI_K3_MODEL_ID);
if (!live) throw new Error(`OpenRouter does not currently advertise ${KIMI_K3_MODEL_ID}`);

const endpointUrl = new URL(live.links?.details || `/api/v1/models/${KIMI_K3_MODEL_ID}/endpoints`, 'https://openrouter.ai');
const endpointsResponse = await fetch(endpointUrl);
if (!endpointsResponse.ok) {
  throw new Error(`OpenRouter endpoint discovery failed (${endpointsResponse.status})`);
}
const endpointData = await endpointsResponse.json();
const endpoints = endpointData?.data?.endpoints || [];
const activeEndpoint = endpoints.find((endpoint) => endpoint.status === 0) || endpoints[0];
if (!activeEndpoint) throw new Error(`${KIMI_K3_MODEL_ID} has no provider endpoint`);

const liveEfforts = Array.isArray(live.reasoning?.supported_efforts)
  ? live.reasoning.supported_efforts
  : [];
const requiredParameters = ['max_tokens', 'reasoning_effort', 'response_format', 'structured_outputs', 'tool_choice', 'tools'];
const liveParameters = new Set(activeEndpoint.supported_parameters || live.supported_parameters || []);
const differences = [];

function compare(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    differences.push(`${label}: live=${JSON.stringify(actual)} fallback=${JSON.stringify(expected)}`);
  }
}

compare('context window', live.context_length, fallback.contextWindow);
compare('endpoint context window', activeEndpoint.context_length, fallback.contextWindow);
compare('input modalities', [...(live.architecture?.input_modalities || [])].sort(), [...fallback.inputModalities].sort());
compare('mandatory reasoning', live.reasoning?.mandatory === true, fallback.reasoningMandatory);
compare('reasoning efforts', [...liveEfforts].sort(), [...fallback.supportedReasoningEfforts].sort());
for (const parameter of requiredParameters) {
  if (!liveParameters.has(parameter)) differences.push(`missing required parameter: ${parameter}`);
}
if (activeEndpoint.provider_name !== 'Moonshot AI') {
  differences.push(`provider endpoint: live=${JSON.stringify(activeEndpoint.provider_name)} expected="Moonshot AI"`);
}

if (differences.length > 0) {
  console.error('Kimi K3 capability drift detected. Refresh shared/modelCapabilities.ts before release:');
  for (const difference of differences) console.error(`- ${difference}`);
  process.exitCode = 1;
} else {
  console.log(`Kimi K3 capabilities match OpenRouter (${activeEndpoint.provider_name}; efforts: ${liveEfforts.join(', ')}).`);
}
