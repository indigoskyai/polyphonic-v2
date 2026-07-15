import { toOpenResponsesContent } from "./openresponses-content.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string) {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected error containing: ${expectedMessage}`);
}

Deno.test("converts chat text and image parts for the OpenRouter Agent SDK", () => {
  assertEquals(
    toOpenResponsesContent([
      { type: "text", text: "What is in this image?" },
      {
        type: "image_url",
        image_url: { url: "https://example.test/signed-image", detail: "high" },
      },
    ]),
    [
      { type: "input_text", text: "What is in this image?" },
      {
        type: "input_image",
        imageUrl: "https://example.test/signed-image",
        detail: "high",
      },
    ],
    "Chat image content was not converted to OpenResponses input",
  );
});

Deno.test("converts PDF, audio, and video parts for the OpenRouter Agent SDK", () => {
  assertEquals(
    toOpenResponsesContent([
      {
        type: "file",
        file: {
          filename: "report.pdf",
          file_data: "https://example.test/signed-pdf",
        },
      },
      {
        type: "input_audio",
        input_audio: { data: "base64-audio", format: "mp3" },
      },
      { type: "video_url", video_url: { url: "data:video/mp4;base64,video" } },
    ]),
    [
      {
        type: "input_file",
        filename: "report.pdf",
        fileUrl: "https://example.test/signed-pdf",
      },
      {
        type: "input_audio",
        inputAudio: { data: "base64-audio", format: "mp3" },
      },
      { type: "input_video", videoUrl: "data:video/mp4;base64,video" },
    ],
    "Multimodal attachment content was not converted to OpenResponses input",
  );
});

Deno.test("preserves native OpenResponses parts and separates file data from URLs", () => {
  assertEquals(
    toOpenResponsesContent([
      {
        type: "input_image",
        imageUrl: "data:image/png;base64,image",
        detail: "low",
      },
      {
        type: "input_file",
        filename: "inline.pdf",
        fileData: "data:application/pdf;base64,pdf",
      },
    ]),
    [
      {
        type: "input_image",
        imageUrl: "data:image/png;base64,image",
        detail: "low",
      },
      {
        type: "input_file",
        filename: "inline.pdf",
        fileData: "data:application/pdf;base64,pdf",
      },
    ],
    "Native OpenResponses content was not normalized safely",
  );
});

Deno.test("rejects malformed attachment content before calling the model", () => {
  assertThrows(
    () => toOpenResponsesContent([{ type: "image_url", image_url: {} }]),
    "missing its temporary access URL",
  );
  assertThrows(
    () => toOpenResponsesContent([{ type: "unsupported" }]),
    "Unsupported attachment content part",
  );
});
