import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PIPELINE_LABELS } from "@/lib/constants/business-templates";

/** The workspace's own names for the five pipeline stages (Settings → Lead fields & pipeline). */
export function usePipelineLabels(agentId: string | undefined): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["pipeline-labels", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/settings?agentId=${agentId}`);
      if (!res.ok) return DEFAULT_PIPELINE_LABELS;
      const settings = (await res.json()) as Record<string, string>;
      try {
        return { ...DEFAULT_PIPELINE_LABELS, ...JSON.parse(settings.pipelineLabels || "{}") };
      } catch {
        return DEFAULT_PIPELINE_LABELS;
      }
    },
    enabled: !!agentId,
  });
  return data ?? DEFAULT_PIPELINE_LABELS;
}
