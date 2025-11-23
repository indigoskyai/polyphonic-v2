export default function ProgressTracker() {
  return (
    <div className="h-screen w-full overflow-hidden">
      <iframe
        src="/architecture-tracker.html"
        className="w-full h-full border-0"
        title="Architecture Progress Tracker"
      />
    </div>
  );
}
