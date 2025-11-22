export const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-black z-[10000] flex items-center justify-center animate-fade-in">
      <div className="text-center">
        <div className="text-5xl font-thin tracking-[0.3em] text-white mb-6 animate-pulse">
          POLYPHONIC
        </div>
        <div className="flex gap-2 justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-gray-300 rounded-full"
              style={{
                animation: `bounce 1.4s ease-in-out ${i * -0.16}s infinite both`
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
