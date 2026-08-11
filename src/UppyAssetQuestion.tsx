import { createElement, useEffect, useId, useMemo, useRef, useState } from "react";
import Uppy from "@uppy/core";
import { useUppyEvent, useUppyState } from "@uppy/react";
import XHRUpload from "@uppy/xhr-upload";
import { ElementFactory, Question, Serializer } from "survey-core";
import { ReactQuestionFactory } from "survey-react-ui";

import type { AssetUploadSession, UploadedAssetAnswer } from "../shared/events";
import { isUploadedAssetAnswer } from "../shared/cfp-definition";
import { abandonUpload, startUpload } from "./api";

const QUESTION_TYPE = "chartstead-file";

export class QuestionChartsteadFileModel extends Question {
  getType(): string {
    return QUESTION_TYPE;
  }

  get maxFileBytes(): number {
    return this.getPropertyValue("maxFileBytes") ?? 5 * 1024 * 1024;
  }

  set maxFileBytes(value: number) {
    this.setPropertyValue("maxFileBytes", value);
  }

  get acceptMimeTypes(): string[] {
    return this.getPropertyValue("acceptMimeTypes") ?? [];
  }

  set acceptMimeTypes(value: string[]) {
    this.setPropertyValue("acceptMimeTypes", value);
  }
}

let registered = false;

export function registerUppyAssetQuestion(): void {
  if (registered) return;
  registered = true;

  ElementFactory.Instance.registerElement(
    QUESTION_TYPE,
    (name) => new QuestionChartsteadFileModel(name),
  );

  Serializer.addClass(
    QUESTION_TYPE,
    [
      { name: "maxFileBytes:number", default: 5 * 1024 * 1024 },
      {
        name: "acceptMimeTypes",
        default: [],
        isSerializable: true,
        onSetValue: (obj: QuestionChartsteadFileModel, value: unknown) => {
          obj.setPropertyValue(
            "acceptMimeTypes",
            Array.isArray(value)
              ? value.filter((entry): entry is string => typeof entry === "string")
              : [],
          );
        },
      },
    ],
    () => new QuestionChartsteadFileModel(""),
    "question",
  );

  ReactQuestionFactory.Instance.registerQuestion(
    QUESTION_TYPE,
    ((props: { question: QuestionChartsteadFileModel }) =>
      createElement(UppyAssetQuestion, {
        question: props.question,
      })) as never,
  );
}

function readUploadContext(question: QuestionChartsteadFileModel): {
  eventId: string;
  formId: string;
  definitionVersion: number;
  mode: string;
  policyQuestionName: string;
} {
  const survey = question.survey as {
    getVariable?: (name: string) => unknown;
  } | null;
  const eventId = String(survey?.getVariable?.("eventId") ?? "");
  const formId = String(survey?.getVariable?.("formId") ?? "");
  const definitionVersion = Number(
    survey?.getVariable?.("definitionVersion") ?? Number.NaN,
  );
  const mode = String(survey?.getVariable?.("mode") ?? "public");

  const questionName =
    typeof question.getValueName === "function"
      ? String(question.getValueName())
      : question.name;
  const parent = (
    question as unknown as {
      parent?: {
        isPanel?: boolean;
        name?: string;
        parentQuestion?: { name?: string };
      };
    }
  ).parent;
  const panelQuestionName = parent?.parentQuestion?.name;
  const policyQuestionName = panelQuestionName
    ? `${panelQuestionName}.${questionName}`
    : questionName;

  return { eventId, formId, definitionVersion, mode, policyQuestionName };
}

function createXhrUploadOptions(
  question: QuestionChartsteadFileModel,
  sessionByFileId: Map<string, AssetUploadSession>,
) {
  return {
    method: "PUT" as const,
    formData: false,
    shouldRetry: () => false,
    endpoint: async (fileOrBundle: unknown) => {
      const file = (
        Array.isArray(fileOrBundle) ? fileOrBundle[0] : fileOrBundle
      ) as {
        id?: string;
        name?: string;
        type?: string;
        size?: number | null;
        data?: { size?: number };
      };
      const uploadContext = readUploadContext(question);
      if (uploadContext.mode === "preview") {
        throw new Error("Uploads are disabled in preview.");
      }
      if (
        !uploadContext.eventId ||
        !uploadContext.formId ||
        !Number.isInteger(uploadContext.definitionVersion)
      ) {
        throw new Error("Event context is missing for uploads.");
      }
      const sizeBytes = Number(file.size ?? file.data?.size ?? 0);
      const session = await startUpload(uploadContext.eventId, {
        formId: uploadContext.formId,
        formDefinitionVersion: uploadContext.definitionVersion,
        questionName: uploadContext.policyQuestionName,
        fileName: String(file.name ?? "upload"),
        mime: file.type || "application/octet-stream",
        sizeBytes,
      });
      if (file.id) {
        sessionByFileId.set(file.id, session);
      }
      return session.uploadUrl;
    },
    headers: (file: { type?: string | null }) => ({
      "content-type": file.type || "application/octet-stream",
    }),
    responseType: "text" as const,
    getResponseData: (xhr: XMLHttpRequest) => {
      const parsed = JSON.parse(xhr.responseText) as {
        asset?: UploadedAssetAnswer;
      };
      if (!parsed.asset || !isUploadedAssetAnswer(parsed.asset)) {
        throw new Error("Upload failed. Try again.");
      }
      return {
        url: parsed.asset.objectKey,
        assetId: parsed.asset.assetId,
        objectKey: parsed.asset.objectKey,
        name: parsed.asset.name,
        mime: parsed.asset.mime,
        size: parsed.asset.size,
        status: parsed.asset.status,
      };
    },
    timeout: 60_000,
    limit: 1,
  };
}

function progressPercent(file: {
  progress?: {
    bytesUploaded?: number | boolean | null;
    bytesTotal?: number | null;
    percentage?: number | null;
  } | null;
} | null): number | null {
  if (!file?.progress) return null;
  const { percentage, bytesUploaded, bytesTotal } = file.progress;
  if (typeof percentage === "number" && Number.isFinite(percentage)) {
    return Math.max(0, Math.min(100, Math.round(percentage)));
  }
  if (
    typeof bytesUploaded === "number" &&
    typeof bytesTotal === "number" &&
    bytesTotal > 0
  ) {
    return Math.max(
      0,
      Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)),
    );
  }
  return null;
}

function createUppyInstance(
  question: QuestionChartsteadFileModel,
  sessionByFileId: Map<string, AssetUploadSession>,
): Uppy {
  return new Uppy({
    id: `cfp-${question.name}`,
    autoProceed: true,
    allowMultipleUploadBatches: true,
    restrictions: {
      maxNumberOfFiles: 1,
      maxFileSize: question.maxFileBytes,
      allowedFileTypes:
        question.acceptMimeTypes.length > 0
          ? question.acceptMimeTypes
          : undefined,
    },
  }).use(XHRUpload, createXhrUploadOptions(question, sessionByFileId));
}

function UppyAssetQuestion({
  question,
}: {
  question: QuestionChartsteadFileModel;
}) {
  const sessionByFileId = useMemo(() => new Map<string, AssetUploadSession>(), []);
  // useRef + render-time create: Strict Mode destroy must not leave a dead
  // useState instance (destroyed Uppy keeps addFile/upload but no uploaders).
  const uppyRef = useRef<Uppy | null>(null);
  if (!uppyRef.current) {
    uppyRef.current = createUppyInstance(question, sessionByFileId);
  }
  const uppy = uppyRef.current;

  useEffect(() => {
    return () => {
      const instance = uppyRef.current;
      uppyRef.current = null;
      if (instance) {
        instance.cancelAll();
        instance.destroy();
      }
    };
  }, []);

  return (
    <UppyAssetQuestionActive
      key={uppy.getID()}
      question={question}
      uppy={uppy}
      sessionByFileId={sessionByFileId}
    />
  );
}

function UppyAssetQuestionActive({
  question,
  uppy,
  sessionByFileId,
}: {
  question: QuestionChartsteadFileModel;
  uppy: Uppy;
  sessionByFileId: Map<string, AssetUploadSession>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "uploading" | "failed" | "complete"
  >("idle");
  const [completedAsset, setCompletedAsset] = useState<UploadedAssetAnswer | null>(
    () => {
      const initial = question.value as UploadedAssetAnswer | null;
      return initial?.status === "complete" ? initial : null;
    },
  );
  const value =
    completedAsset ??
    ((question.value ?? null) as UploadedAssetAnswer | null);

  const files = useUppyState(uppy, (state) => state.files);
  const totalProgress = useUppyState(uppy, (state) => state.totalProgress);
  const fileList = Object.values(files);
  const activeFile = fileList[0] ?? null;
  const activeFileName =
    activeFile && typeof activeFile.name === "string" ? activeFile.name : null;
  const percent =
    progressPercent(activeFile) ??
    (uploadPhase === "uploading" ? Math.round(totalProgress) : null);

  useUppyEvent(uppy, "upload", () => {
    setLocalError(null);
    setUploadPhase("uploading");
    setCompletedAsset(null);
    question.value = null;
  });

  useUppyEvent(uppy, "upload-progress", () => {
    setUploadPhase("uploading");
  });

  useUppyEvent(uppy, "upload-success", (file, response) => {
    const body = response?.body as Record<string, unknown> | undefined;
    const assetCandidate = body
      ? {
          assetId: body.assetId,
          objectKey: body.objectKey,
          name: body.name,
          mime: body.mime,
          size: body.size,
          status: body.status,
        }
      : null;
    if (!assetCandidate || !isUploadedAssetAnswer(assetCandidate)) {
      setLocalError("Upload failed. Try again.");
      setUploadPhase("failed");
      question.value = null;
      return;
    }
    const asset: UploadedAssetAnswer = assetCandidate;
    question.value = asset;
    setCompletedAsset(asset);
    setLocalError(null);
    setUploadPhase("complete");
    if (file?.id) {
      sessionByFileId.delete(file.id);
    }
  });

  useUppyEvent(uppy, "upload-error", (_file, error) => {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Upload failed. Try again.";
    setLocalError(message);
    setUploadPhase("failed");
    setCompletedAsset(null);
    question.value = null;
  });

  useUppyEvent(uppy, "restriction-failed", (_file, error) => {
    setLocalError(
      error instanceof Error ? error.message : "That file is not allowed.",
    );
    setUploadPhase("failed");
    setCompletedAsset(null);
    question.value = null;
  });

  useUppyEvent(uppy, "cancel-all", () => {
    setUploadPhase(completedAsset?.status === "complete" ? "complete" : "idle");
    setLocalError(null);
  });

  useEffect(() => {
    const survey = question.survey as {
      onCompleting?: {
        add: (
          handler: (
            sender: unknown,
            options: { allow?: boolean; message?: string },
          ) => void,
        ) => void;
        remove: (
          handler: (
            sender: unknown,
            options: { allow?: boolean; message?: string },
          ) => void,
        ) => void;
      };
    } | null;
    if (!survey?.onCompleting) return;

    const handleCompleting = (
      _sender: unknown,
      options: { allow?: boolean; message?: string },
    ) => {
      if (uploadPhase === "uploading") {
        options.allow = false;
        options.message = "Wait for file uploads to finish.";
        return;
      }
      if (uploadPhase === "failed" || localError) {
        options.allow = false;
        options.message = "Fix failed uploads before submitting.";
      }
    };

    survey.onCompleting.add(handleCompleting);
    return () => {
      survey.onCompleting?.remove(handleCompleting);
    };
  }, [localError, question.survey, uploadPhase]);

  function clearAnswer() {
    const previous = completedAsset ?? (question.value as UploadedAssetAnswer | null);
    const uploadContext = readUploadContext(question);
    question.value = null;
    setCompletedAsset(null);
    setLocalError(null);
    setUploadPhase("idle");
    for (const file of uppy.getFiles()) {
      uppy.removeFile(file.id);
    }
    if (inputRef.current) inputRef.current.value = "";
    if (
      previous?.assetId &&
      uploadContext.eventId &&
      uploadContext.mode !== "preview"
    ) {
      void abandonUpload(uploadContext.eventId, previous.assetId).catch(() => {
        // best-effort server cleanup; client already cleared the answer
      });
    }
  }

  function addSelectedFile(file: File) {
    const uploadContext = readUploadContext(question);
    setLocalError(null);

    if (uploadContext.mode === "preview") {
      setLocalError("Uploads are disabled in preview.");
      setUploadPhase("failed");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > question.maxFileBytes) {
      setLocalError(
        `Use a file of ${Math.floor(question.maxFileBytes / (1024 * 1024))} MB or smaller.`,
      );
      setUploadPhase("failed");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (
      question.acceptMimeTypes.length > 0 &&
      !question.acceptMimeTypes.includes(file.type)
    ) {
      setLocalError("That file type is not allowed.");
      setUploadPhase("failed");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    for (const existing of uppy.getFiles()) {
      uppy.removeFile(existing.id);
    }
    question.value = null;
    setUploadPhase("uploading");

    try {
      uppy.addFile({
        name: file.name,
        type: file.type || "application/octet-stream",
        data: file,
        source: "file-input",
      });
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Unable to add that file.",
      );
      setUploadPhase("failed");
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRetry() {
    setLocalError(null);
    const filesToRetry = uppy.getFiles().filter((file) => file.error);
    if (filesToRetry.length === 0) {
      inputRef.current?.click();
      return;
    }
    setUploadPhase("uploading");
    for (const file of filesToRetry) {
      void uppy.retryUpload(file.id);
    }
  }

  function handleCancel() {
    uppy.cancelAll();
    question.value = null;
    setCompletedAsset(null);
    setLocalError(null);
    setUploadPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  const completeValue =
    value?.status === "complete" && uploadPhase !== "uploading" ? value : null;
  const showProgress = uploadPhase === "uploading" && percent != null;
  const showActiveName =
    uploadPhase === "uploading" && activeFileName
      ? activeFileName
      : completeValue?.name;

  const accept = question.acceptMimeTypes.join(",");
  const labelText = question.title ? String(question.title) : "Upload file";

  return (
    <div className="cfp-file-question">
      {completeValue ? (
        <div className="cfp-file-complete">
          <div>
            <strong>{completeValue.name}</strong>
            <span>
              {(completeValue.size / 1024).toFixed(1)} KB · {completeValue.mime}
            </span>
          </div>
          <div className="cfp-file-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                clearAnswer();
                inputRef.current?.click();
              }}
            >
              Replace file
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearAnswer}
            >
              Remove
            </button>
          </div>
        </div>
      ) : uploadPhase === "uploading" ? (
        <div className="cfp-file-active">
          {showActiveName ? <strong>{showActiveName}</strong> : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCancel}
          >
            Cancel upload
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => inputRef.current?.click()}
          aria-controls={inputId}
        >
          Choose file
        </button>
      )}

      <label className="visually-hidden" htmlFor={inputId}>
        {labelText}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        hidden
        accept={accept || undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) addSelectedFile(file);
        }}
      />

      {showProgress ? (
        <div className="cfp-file-progress" role="status" aria-live="polite">
          <div
            className="cfp-file-progress-bar"
            style={{ width: `${percent}%` }}
          />
          <span>{percent}%</span>
        </div>
      ) : null}

      {localError || uploadPhase === "failed" ? (
        <div className="cfp-file-error" role="alert">
          <p>{localError ?? "Upload failed. Try again."}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRetry}
          >
            Retry upload
          </button>
        </div>
      ) : null}
    </div>
  );
}
