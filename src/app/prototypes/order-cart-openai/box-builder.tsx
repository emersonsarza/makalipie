"use client";
import {
  ShoppingExperience,
  type ExperienceProps,
} from "./shopping-experience";
export function BoxBuilder(props: ExperienceProps) {
  return <ShoppingExperience {...props} direction="builder" />;
}
