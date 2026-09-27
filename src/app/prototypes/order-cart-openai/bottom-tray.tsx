"use client";
import {
  ShoppingExperience,
  type ExperienceProps,
} from "./shopping-experience";
export function BottomTray(props: ExperienceProps) {
  return <ShoppingExperience {...props} direction="bottom" />;
}
