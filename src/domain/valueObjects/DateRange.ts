export interface DateRange {
  from: Date;
  to: Date;
}

export function createDateRange(daysBack: number = 90, referenceDate?: Date): DateRange {
  const to = referenceDate ? new Date(referenceDate) : new Date();
  to.setUTCHours(23, 59, 59, 999);
  
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - daysBack);
  from.setUTCHours(0, 0, 0, 0);
  
  console.log(`Created date range (UTC): ${from.toISOString()} - ${to.toISOString()} (${daysBack} days back from ${to.toISOString()})`);
  
  return { from, to };
}

export function createDateRangeFromDates(fromInput: string | Date, toInput: string | Date): DateRange {
  let fromStr: string;
  let toStr: string;

  if (typeof fromInput === 'string') {
    fromStr = fromInput;
  } else {
    fromStr = fromInput.toISOString().split('T')[0];
  }

  if (typeof toInput === 'string') {
    toStr = toInput;
  } else {
    toStr = toInput.toISOString().split('T')[0];
  }

  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  
  if (isNaN(from.getTime())) {
    throw new Error('Invalid from date');
  }

  if (isNaN(to.getTime())) {
    throw new Error('Invalid to date');
  }

  if (from > to) {
    throw new Error('From date must be before to date');
  }
  
  console.log(`Created date range from dates: ${fromStr} to ${toStr}`);
  console.log(`UTC range: ${from.toISOString()} - ${to.toISOString()}`);
  
  return { from, to };
}