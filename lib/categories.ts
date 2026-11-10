export const CATEGORIES = [
  { value: "power-tools", label: "Power tools" },
  { value: "garden", label: "Garden" },
  { value: "kitchen", label: "Kitchen" },
  { value: "camping", label: "Camping" },
  { value: "sports", label: "Sports" },
  { value: "electronics", label: "Electronics" },
  { value: "other", label: "Other" },
] as const;

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Condition = (typeof CONDITIONS)[number];

export function categoryLabel(value: string): string {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

export function conditionLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
