import { useState, useEffect } from "react";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "update-available"; latestVersion: string; releaseUrl: string };

/**
 * Fetches the latest GitHub release and compares it with the current version.
 * Runs once on mount. Silently fails if the request errors.
 */
export function useUpdateCheck(currentVersion: string): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    setState({ status: "checking" });

    fetch("https://api.github.com/repos/Asdoos/FinanceTracker/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => {
        if (!r.ok) throw new Error("GitHub API error");
        return r.json();
      })
      .then((data: { tag_name?: string; html_url?: string }) => {
        const latest = (data.tag_name ?? "").replace(/^v/, "");
        const current = currentVersion.replace(/^v/, "");
        if (latest && latest !== current) {
          setState({
            status: "update-available",
            latestVersion: latest,
            releaseUrl: data.html_url ?? "https://github.com/Asdoos/FinanceTracker/releases/latest",
          });
        } else {
          setState({ status: "up-to-date" });
        }
      })
      .catch(() => setState({ status: "up-to-date" }));
  }, [currentVersion]);

  return state;
}
