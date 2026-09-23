export function MobilePlaceholderPage({
  title,
  description,
  hints,
}: {
  title: string;
  description: string;
  hints?: string[];
}) {
  return (
    <div className="joy-m-page">
      <header className="joy-m-hero">
        <p className="joy-m-hero-kicker">JoyAI</p>
        <h2 className="joy-m-hero-title">{title}</h2>
        <p className="joy-m-hero-sub">{description}</p>
      </header>
      {(hints ?? []).map((text) => (
        <div key={text} className="joy-m-card">
          <p className="joy-m-card-text">{text}</p>
        </div>
      ))}
    </div>
  );
}
