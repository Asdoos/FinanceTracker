import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  accounts: defineTable({
    name: v.string(),
    color: v.string(),       // hex color, e.g. "#3b82f6"
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  }),

  categories: defineTable({
    name: v.string(),        // "Wohnen", "Abos", "KFZ", "Sonstiges"
    color: v.string(),
    icon: v.optional(v.string()),
  }),

  expense_items: defineTable({
    label: v.string(),
    amount: v.number(),
    type: v.union(v.literal("monthly"), v.literal("annual")),
    categoryId: v.id("categories"),
    accountId: v.id("accounts"),
    isActive: v.boolean(),
    note: v.optional(v.string()),
  })
    .index("by_category", ["categoryId"])
    .index("by_account", ["accountId"]),

  income_sources: defineTable({
    label: v.string(),
    amount: v.number(),
    type: v.union(v.literal("monthly"), v.literal("annual")),
    accountId: v.id("accounts"),
    isActive: v.boolean(),
    note: v.optional(v.string()),
  })
    .index("by_account", ["accountId"]),
});
