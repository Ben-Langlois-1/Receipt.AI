



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

    let mostRecent = transactions[0].date;

    return mostRecent;
}