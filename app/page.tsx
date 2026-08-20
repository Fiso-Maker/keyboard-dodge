import type { Metadata } from "next";
import { KeyboardDodge } from "./KeyboardDodge";

export const metadata: Metadata = {
  title: "KEY//DODGE — Variable Tempo QWERTY Stages",
  description:
    "Clear six physical-keyboard stages where the BPM and playable QWERTY zone expand, contract, slow down, and accelerate mid-sequence.",
};

export default function Home() {
  return <KeyboardDodge />;
}
