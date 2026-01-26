export function calcSpentPerScale(source: number, price: number, scale: number = 1e6) {
    const spent = source / scale
    return spent * price
}