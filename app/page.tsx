import { Ambient } from "./Ambient";

export default function AmbientPage() {
  return (
    <div className="relative flex min-h-[calc(100svh-var(--chrome))] flex-col px-4 pb-12 sm:px-8 lg:pb-8">
      <h1 className="sr-only">Ambient</h1>
      <Ambient />
    </div>
  );
}
