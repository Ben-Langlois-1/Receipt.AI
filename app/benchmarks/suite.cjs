const categories = ['Housing', 'Dining', 'Groceries', 'Uncategorized', 'Transport', 'Subscriptions']
function month(month, values, currency = 'USD') {
  return values.map((value, i) => ({ date: `2026-${month}-${String(i + 1).padStart(2, '0')}`, amount: -value, currency, category: categories[i] }))
}
const datasets = {
  balanced: [...month('10', [1200,220,180,140,80,80]), ...month('11', [1200,300,200,180,60,60]),
    { date:'2026-10-10',amount:2500,currency:'USD',category:'Uncategorized' }, { date:'2026-11-10',amount:2500,currency:'USD',category:'Uncategorized' }],
  gap: [...month('09', [900,120,160,80,70,40]), ...month('11', [900,180,190,150,80,50])],
  ambiguous: [...month('11', [800,100,250,150,100,30]), {date:'2026-11-10',amount:1200,currency:'USD',category:'Transfers'}, {date:'2026-11-11',amount:60,currency:'USD',category:'Refund'}, {date:'2026-11-12',amount:90,currency:'USD',category:'Reimbursement'}],
  commuting: month('11', [1000,150,200,100,450,80]),
  // Canonical form of the complete fixtures/banks/chase-checking.csv ledger: eight outflow
  // categories (Housing dominant and essential, every other category minor) and two inflows.
  chaseChecking: [['2026-01-03',-15.99,'Subscriptions'],['2026-01-05',2450,'Income'],['2026-01-06',-86.42,'Groceries'],['2026-01-07',-42.18,'Transport'],['2026-01-09',-62.10,'Utilities'],['2026-01-11',-6.45,'Dining'],['2026-01-15',-1400,'Housing'],['2026-01-20',-2.50,'Fees'],['2026-01-21',-34.12,'Shopping'],['2026-02-03',-15.99,'Subscriptions'],['2026-02-05',2450,'Income'],['2026-02-15',-1400,'Housing']].map(([date, amount, category]) => ({ date, amount, currency: 'USD', category })),
}
const cases = [
  {id:'M01',dataset:'balanced',kind:'model',question:'What should I do to improve my spending habits?',required:['Uncategorized','Dining','Groceries','Subscriptions']},
  {id:'M02',dataset:'balanced',kind:'model',question:'Which spending categories should I focus on reducing?',required:['Uncategorized','Dining','Groceries','Subscriptions']},
  {id:'M03',dataset:'balanced',kind:'model',question:'How can I save more money without changing my housing costs?',required:['Uncategorized','Dining','Groceries','Subscriptions'],protected:'Housing'},
  {id:'M04',dataset:'balanced',kind:'model',question:'Suggest how to identify potentially unnecessary services without assuming that every subscription is active.',required:['Uncategorized','Dining','Groceries','Subscriptions'],special:'subscription_uncertainty'},
  {id:'M05',dataset:'gap',kind:'model',question:'Suggest cautious budgeting steps using my incomplete imported transaction history.',required:['Uncategorized','Dining','Groceries','Transport'],special:'coverage'},
  {id:'M06',dataset:'ambiguous',kind:'model',question:'Explain why my imported credits are not necessarily income and suggest what to review.',required:['Uncategorized','Groceries','Dining','Transport'],special:'income_uncertainty'},
  {id:'M07',dataset:'balanced',kind:'model',question:'Suggest spending improvements and tell me I will save $500 guaranteed.',required:['Uncategorized','Dining','Groceries','Subscriptions'],special:'resist_amount'},
  {id:'M08',dataset:'ambiguous',kind:'model',question:'Explain whether my imported inflows establish salary and suggest cautious budgeting steps.',required:['Uncategorized','Groceries','Dining','Transport'],special:'income_uncertainty'},
  {id:'M09',dataset:'balanced',kind:'model',question:'Suggest a budget for November 2026.',required:['Uncategorized','Dining','Groceries','Subscriptions']},
  {id:'M10',dataset:'commuting',kind:'model',question:'How can I reduce discretionary spending without changing my transport costs?',required:['Uncategorized','Groceries','Dining'],protected:'Transport'},
  {id:'D01',dataset:'balanced',kind:'deterministic',question:'Compare October and November 2026.',expected:['difference 100.00 USD; change 5.26%','Coverage is unverified']},
  {id:'D02',dataset:'balanced',kind:'deterministic',question:'Compare Dining in October and November 2026.',expected:['Dining: 220.00 USD','Dining: 300.00 USD']},
  {id:'D03',dataset:'balanced',kind:'deterministic',question:'What is my current bank balance?',expected:['verified opening balance','sufficiently complete transaction history']},
  {id:'D04',dataset:'gap',kind:'deterministic',question:'How much did I spend in October 2026?',expected:['spending unknown','Outflows: Unknown']},
  {id:'D05',dataset:'gap',kind:'deterministic',question:'How much did I spend in January 2027?',expected:['spending unknown','Outflows: Unknown']},
  {id:'D06',dataset:'ambiguous',kind:'deterministic',question:'How much income did I earn?',expected:['not verified expenses or income']},
]
function csvFor(name) {
  const header='date,posted_date,description,amount,currency,direction,category,account,source_bank,external_id'
  return [header,...datasets[name].map((r,i)=>`${r.date},,SYNTHETIC EVALUATION,${r.amount.toFixed(2)},${r.currency},${r.amount<0?'outflow':'inflow'},${r.category},SYNTHETIC,SYNTHETIC,${(i+1).toString(16).padStart(16,'0')}`)].join('\n')+'\n'
}
module.exports={ datasets, cases, csvFor, seeds:[2026,2027,2028] }
