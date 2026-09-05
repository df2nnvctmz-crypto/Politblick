import React from "react";
import { Composition } from "remotion";
import { SlideSpend } from "./SlideSpend";
import { SlideTies } from "./SlideTies";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SlideSpend"
        component={SlideSpend}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SlideTies"
        component={SlideTies}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
