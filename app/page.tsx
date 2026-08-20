import type { Metadata } from "next";
import { KeyboardDodge } from "./KeyboardDodge";

export const metadata: Metadata = {
  title: "KEY//DODGE — Keyboard Rhythm Survival",
  description:
    "Use the physical QWERTY keyboard as your arena and dodge attacks to the beat.",
};

export default function Home() {
  return <KeyboardDodge />;
}
