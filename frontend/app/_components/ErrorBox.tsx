import { ApiError } from "../_lib/api";

export function ErrorBox({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;
  const traceback = error instanceof ApiError ? error.traceback : "";
  return (
    <div className="error-box" data-testid="error-box">
      <span>{error.message}</span>
      {traceback ? (
        <details>
          <summary>traceback</summary>
          <pre>{traceback}</pre>
        </details>
      ) : null}
    </div>
  );
}
