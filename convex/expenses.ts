import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("expense_items").collect();
    const categories = await ctx.db.query("categories").collect();
    const accounts = await ctx.db.query("accounts").collect();

    const catMap = Object.fromEntries(categories.map((c) => [c._id, c]));
    const accMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

    return items.map((item) => ({
      ...item,
      category: catMap[item.categoryId] ?? null,
      account: accMap[item.accountId] ?? null,
      monthlyAmount:
        item.type === "annual" ? item.amount / 12 : item.amount,
    }));
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    amount: v.number(),
    type: v.union(v.literal("monthly"), v.literal("annual")),
    categoryId: v.id("categories"),
    accountId: v.id("accounts"),
    isActive: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("expense_items", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("expense_items"),
    label: v.optional(v.string()),
    amount: v.optional(v.number()),
    type: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    categoryId: v.optional(v.id("categories")),
    accountId: v.optional(v.id("accounts")),
    isActive: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("expense_items") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
