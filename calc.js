function calc (arr, n) {

  let l = arr.length
  if (!n || (n - l < 0)) {
    n = l
  }
  const narr = arr.map((item, index) => {
    return item * Math.pow(1.033, l--)
  })
  let amount = narr.reduce((p, c) => p + c, 0)
  return amount * Math.pow(1.033, n - l)
}

console.log(calc([60000, 60000, 60000, 60000, 60000], 20))
