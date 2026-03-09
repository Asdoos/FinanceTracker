import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("income_sources").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const accMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

    return items.map((item) => ({
      ...item,
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
    accountId: v.id("accounts"),
    isActive: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("income_sources", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("income_sources"),
    label: v.optional(v.string()),
    amount: v.optional(v.number()),
    type: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    accountId: v.optional(v.id("accounts")),
    isActive: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await ctx.db.patch(id, fields);
  },
});

export const remove = mutation({
  args: { id: v.id("income_sources") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
