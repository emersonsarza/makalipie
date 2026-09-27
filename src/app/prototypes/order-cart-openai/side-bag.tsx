"use client";
import {
  ShoppingExperience,
  type ExperienceProps,
} from "./shopping-experience";
export function SideBag(props: ExperienceProps) {
  return <ShoppingExperience {...props} direction="side" />;
}
