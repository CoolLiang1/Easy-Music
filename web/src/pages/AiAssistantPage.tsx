import { useAuth } from "../auth/AuthProvider";

export function AiAssistantPage() {
  const { accessToken } = useAuth();

  return (
    <section className="page-panel" aria-labelledby="ai-assistant-title">
      <p className="eyebrow">AI Assistant V1</p>
      <h1 id="ai-assistant-title">Natural-language recommendations</h1>
      <p className="page-copy">
        Describe what you want to listen to in your own words. The AI Assistant
        parses your request into structured context and delegates ranking to the
        existing recommendation service — it never selects tracks directly and
        never bypasses cooldown or feedback penalties.
      </p>

      <div className="empty-state">
        {accessToken
          ? "AI Assistant interaction will be added in the next task. The API client and types are ready."
          : "Sign in to use the AI Assistant."}
      </div>
    </section>
  );
}
