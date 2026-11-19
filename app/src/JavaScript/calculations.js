

    const currentDatee = new Date()
    export const curMonth = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDatee);
    export const curYear = new Intl.DateTimeFormat('en-US', { year: 'numeric' }).format(currentDatee);



export function totalAmount(transactions) {

    let totalSum = 0;

    for (let i = 0; i < transactions.length; i++) {
        totalSum = totalSum + transactions[i].amount;
    }
    
    return totalSum;

}

export function SpendingIncome(transactions) {

    let spendingTotal = 0
    let incomeTotal = 0

    for (let i = 0; i < transactions.length; i++) {
        if (transactions[i].direction == 'outflow') {
            spendingTotal = spendingTotal + transactions[i].amount;
        } else if (transactions[i].direction == 'inflow') {
            incomeTotal = incomeTotal + transactions[i].amount;
        } else {
            console.log("Could not sum value");
        }
    }

    return { spendingTotal, incomeTotal };
}

export function recentTransaction(transactions) {

    if (transactions.length === 0) {
        return "No data"
    }

    let mostRecent = transactions[transactions.length - 1].date;

    return mostRecent;
}

export function totalTransactions(transactions) {

    let transacTotal = transactions.length

    return transacTotal
}

// MONTHLY OVERVIEW -- CREATING ARRAYS

/**
 * @param {import('../finance/types.ts').LedgerTransaction[]} transactions
 * @returns {import('../finance/types.ts').LedgerTransaction[]}
 */

export function currentMonth(transactions) {
    
    const currentDate = new Date()
    const currMonthArr = []

    for (let i = 0; i < transactions.length; i++) {

        const transactionDate = new Date(`${transactions[i].date}T00:00:00Z`) // changes transaction.date from string to date format
        if ((transactionDate.getUTCMonth() === currentDate.getUTCMonth()) && (transactionDate.getUTCFullYear() === currentDate.getUTCFullYear())) { // checks if the transaction is of the same month and year
            currMonthArr.push(transactions[i]) // appends array item
        } 
    }

    return currMonthArr
    
}

/**
 * @param {import('../finance/types.ts').LedgerTransaction[]} transactions
 * @returns {import('../finance/types.ts').LedgerTransaction[]}
 */

export function last30Days(transactions) {

    const currentDate = new Date()
    const last30DaysArr = []

    for (let i = 0; i < transactions.length; i++) {

        const transactionDate = new Date(`${transactions[i].date}T00:00:00Z`) // Adding Z makes it midnight
        const daysAgo = Math.floor((currentDate.getTime() - transactionDate.getTime()) / 86400000)

        if (daysAgo <= 30 && daysAgo >= 0) {
            last30DaysArr.push(transactions[i])
        }

    }

    return last30DaysArr

}

/**
 * @param {import('../finance/types.ts').LedgerTransaction[]} transactions
 * @returns {import('../finance/types.ts').LedgerTransaction[]}
 */

export function lastMonth(transactions) {

    const currentDate = new Date()
    const lastMonthArr = []

    const PreviousMonthDate = new Date(Date.UTC(
        currentDate.getUTCFullYear(),
        currentDate.getUTCMonth() - 1
    ))

    const previousMonth = PreviousMonthDate.getUTCMonth()
    const previousMonthYear = PreviousMonthDate.getUTCFullYear()

    for (let i = 0; i < transactions.length; i++) {

        const transactionDate = new Date(`${transactions[i].date}T00:00:00Z`) // changes transaction.date from string to date format

        if ((transactionDate.getUTCMonth() === previousMonth) &&
            (transactionDate.getUTCFullYear() === previousMonthYear)) {

            lastMonthArr.push(transactions[i])

        }
        
    }

    return lastMonthArr

}

// MONTHLY OVERVIEW -- CALCULATING TOTALS

export function currentMonthSpendingIncome(lastMonthArr) {

    let monthlySpending = 0
    let monthlyIncome = 0

        for (let i = 0; i < lastMonthArr.length; i++) {
        if (lastMonthArr[i].direction == 'outflow') {
            monthlySpending = monthlySpending + lastMonthArr[i].amount;
        } else if (lastMonthArr[i].direction == 'inflow') {
            monthlyIncome = monthlyIncome + lastMonthArr[i].amount;
        } else {
            console.log("Could not sum value");
        }
    }

    return { monthlySpending, monthlyIncome }

}

export function currentMonthNet(lastMonthArr) {
    let curMonthNet = 0

    for (let i = 0; i < lastMonthArr.length; i++) {
        curMonthNet = curMonthNet + lastMonthArr[i].amount
    }

    return curMonthNet

}

// Line graph

