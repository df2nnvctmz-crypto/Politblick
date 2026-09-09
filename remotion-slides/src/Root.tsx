import React from "react";
import { Composition } from "remotion";
import { SlideSpend } from "./SlideSpend";
import { SlideTies } from "./SlideTies";
import { SlideDiscipline } from "./SlideDiscipline";
import { SlideSplit } from "./SlideSplit";
import { SlideBenchmark } from "./SlideBenchmark";
import { SlideMerz } from "./SlideMerz";

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
      <Composition
        id="SlideDiscipline"
        component={SlideDiscipline}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SlideSplit"
        component={SlideSplit}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SlideBenchmark"
        component={SlideBenchmark}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SlideMerz"
        component={SlideMerz}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
