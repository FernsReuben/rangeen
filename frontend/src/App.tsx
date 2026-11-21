import { Studio } from "./components/studio/studio.tsx";
import { TitleScreen } from "./components/title-screen/title-screen.tsx";

const STUDIO_ID = "studio";

export default function App() {
  return (
    <main>
      <TitleScreen nextSectionId={STUDIO_ID} />
      <Studio id={STUDIO_ID} />
    </main>
  );
}
