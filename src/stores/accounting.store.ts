import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AccountingMonth, Expense } from '../domain/accounting/types'
import { listAccountingMonths, loadAccountingMonth, saveAccountingMonth } from '../services/storage/local-db'

export const useAccountingStore = defineStore('accounting', () => {
  const months = ref<Map<string, AccountingMonth>>(new Map())
  const initialized = ref(false)

  const initialize = async (force = false): Promise<void> => {
    if (initialized.value && !force) return
    const all = await listAccountingMonths()
    const map = new Map<string, AccountingMonth>()
    for (const m of all) map.set(m.yearMonth, m)
    months.value = map
    initialized.value = true
  }

  const getMonth = async (yearMonth: string): Promise<AccountingMonth> => {
    const cached = months.value.get(yearMonth)
    if (cached) return cached
    const stored = await loadAccountingMonth(yearMonth)
    if (stored) {
      months.value.set(yearMonth, stored)
      return stored
    }
    const empty: AccountingMonth = { yearMonth, expenses: [] }
    return empty
  }

  const saveMonth = async (month: AccountingMonth): Promise<void> => {
    const plain: AccountingMonth = JSON.parse(JSON.stringify(month))
    await saveAccountingMonth(plain)
    months.value = new Map(months.value).set(plain.yearMonth, plain)
  }

  const toggleJustified = async (yearMonth: string, expenseId: string): Promise<void> => {
    const month = await getMonth(yearMonth)
    const expense = month.expenses.find((e) => e.id === expenseId)
    if (!expense) return
    expense.justified = !expense.justified
    await saveMonth(month)
  }

  const addExpense = async (yearMonth: string, expense: Expense): Promise<void> => {
    const month = await getMonth(yearMonth)
    month.expenses.push(expense)
    await saveMonth(month)
  }

  const removeExpense = async (yearMonth: string, expenseId: string): Promise<void> => {
    const month = await getMonth(yearMonth)
    month.expenses = month.expenses.filter((e) => e.id !== expenseId)
    await saveMonth(month)
  }

  const importExpenses = async (yearMonth: string, expenses: Expense[]): Promise<void> => {
    const month = await getMonth(yearMonth)
    month.expenses.push(...expenses)
    month.importedAt = new Date().toISOString()
    await saveMonth(month)
  }

  return {
    months,
    initialized,
    initialize,
    getMonth,
    saveMonth,
    toggleJustified,
    addExpense,
    removeExpense,
    importExpenses,
  }
})
