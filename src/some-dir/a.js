'use strict';
import('./b').then(e => e.HengSheng('agc', 'x'))
import('./c');
const sum = (a, b) => a + b
const isIn = (origin, str) => str.indexOf(origin) > -1

export {
  sum,
  isIn
}
