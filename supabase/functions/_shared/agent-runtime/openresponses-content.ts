type UnknownRecord = Record<string, unknown>;

export type OpenResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; imageUrl: string; detail: string }
  | {
    type: "input_file";
    filename?: string;
    fileId?: string | null;
    fileUrl?: string;
    fileData?: string;
  }
  | { type: "input_audio"; inputAudio: { data: string; format: string } }
  | { type: "input_video"; videoUrl: string };

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredString(value: unknown, message: string): string {
  const normalized = nonEmptyString(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function imageUrlFrom(part: UnknownRecord): string {
  const image = asRecord(part.image_url);
  return requiredString(
    part.imageUrl ?? image?.url ?? part.image_url,
    "An image attachment is missing its temporary access URL",
  );
}

function videoUrlFrom(part: UnknownRecord): string {
  const video = asRecord(part.video_url);
  return requiredString(
    part.videoUrl ?? video?.url ?? part.video_url,
    "A video attachment is missing its temporary access URL",
  );
}

function convertFilePart(part: UnknownRecord): OpenResponsesContentPart {
  const source = asRecord(part.file) ?? part;
  const filename = nonEmptyString(source.filename) ?? undefined;
  const fileId = nonEmptyString(source.fileId ?? source.file_id) ?? undefined;
  const explicitUrl = nonEmptyString(source.fileUrl ?? source.file_url);
  const explicitData = nonEmptyString(source.fileData ?? source.file_data);
  const legacyValue = explicitUrl ?? explicitData;

  if (!fileId && !legacyValue) {
    throw new Error(
      "A file attachment is missing its temporary access URL or data",
    );
  }

  const fileUrl = explicitUrl ?? (
    legacyValue && /^https?:\/\//i.test(legacyValue) ? legacyValue : undefined
  );
  const fileData = explicitUrl
    ? explicitData ?? undefined
    : legacyValue && !fileUrl
    ? legacyValue
    : undefined;

  return {
    type: "input_file",
    ...(filename ? { filename } : {}),
    ...(fileId ? { fileId } : {}),
    ...(fileUrl ? { fileUrl } : {}),
    ...(fileData ? { fileData } : {}),
  };
}

function convertAudioPart(part: UnknownRecord): OpenResponsesContentPart {
  const audio = asRecord(part.inputAudio ?? part.input_audio);
  if (!audio) {
    throw new Error("An audio attachment is missing its encoded content");
  }
  return {
    type: "input_audio",
    inputAudio: {
      data: requiredString(
        audio.data,
        "An audio attachment is missing its encoded content",
      ),
      format: requiredString(
        audio.format,
        "An audio attachment is missing its format",
      ),
    },
  };
}

/**
 * The shared attachment resolver emits OpenAI Chat Completions content so it can
 * serve the classic chat runtime. The OpenRouter Agent SDK uses OpenResponses
 * instead, whose content-part names and SDK input casing are different. Adapt
 * only at that runtime boundary so both consumers receive their native shape.
 */
export function toOpenResponsesContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content ?? "";

  return content.map((value, index): OpenResponsesContentPart => {
    const part = asRecord(value);
    if (!part) {
      throw new Error(`Attachment content part ${index + 1} is malformed`);
    }

    const type = nonEmptyString(part.type);
    switch (type) {
      case "text":
      case "input_text":
        return {
          type: "input_text",
          text: typeof part.text === "string"
            ? part.text
            : String(part.text ?? ""),
        };
      case "image_url":
      case "input_image": {
        const image = asRecord(part.image_url);
        return {
          type: "input_image",
          imageUrl: imageUrlFrom(part),
          detail: nonEmptyString(part.detail ?? image?.detail) ?? "auto",
        };
      }
      case "file":
      case "input_file":
        return convertFilePart(part);
      case "input_audio":
        return convertAudioPart(part);
      case "video_url":
      case "input_video":
        return { type: "input_video", videoUrl: videoUrlFrom(part) };
      default:
        throw new Error(
          `Unsupported attachment content part: ${type ?? "unknown"}`,
        );
    }
  });
}
