/** Short, deterministic initials for an avatar label, e.g. "Ben Ortiz" -> "BO". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic HSL background for a person's avatar, stable across renders for the same id. */
function avatarHue(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 55% 45%)`;
}

export function Avatar({ name, seed, size = 32 }: { name: string; seed: string; size?: number }) {
  return (
    <div
      className="avatar"
      style={{ background: avatarHue(seed), width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}
