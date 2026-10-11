import { IconMark, IconLayers, IconShield, IconUsers } from "./icons";

const FEATURES = [
  {
    icon: IconLayers,
    title: "Describe it once, see the exact plan",
    body: "No workflow builder to learn — plain language in, a step-by-step plan out, before anything runs.",
  },
  {
    icon: IconShield,
    title: "Nothing risky happens unattended",
    body: "Every medium- or high-risk step pauses for your explicit approval, enforced by the engine itself.",
  },
  {
    icon: IconUsers,
    title: "Built for a team, not just you",
    body: "Workspaces, roles, invites, and an audit log — ready the moment you need to share it.",
  },
];

export default function AuthBrandPanel() {
  return (
    <div className="auth-brand-panel">
      <div className="row" style={{ gap: 10 }}>
        <IconMark size={26} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19 }}>Automation Platform</span>
      </div>

      <div>
        <h1>Tell it what to automate. Watch exactly what it does.</h1>
        <div style={{ marginTop: 28 }}>
          {FEATURES.map((f) => (
            <div className="auth-feature" key={f.title}>
              <f.icon size={18} />
              <div>
                <div style={{ color: "#f7f1e6", fontWeight: 600, marginBottom: 2 }}>{f.title}</div>
                {f.body}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "rgba(247,241,230,0.5)" }}>
        Runs entirely on infrastructure you control — no required third-party AI account.
      </div>
    </div>
  );
}
