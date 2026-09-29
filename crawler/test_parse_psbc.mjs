import { parsePsbcLink } from '../lib/psbc-parse.ts';

const url = process.argv[2] || 'https://u.psbc.com/4bQ4pk';
parsePsbcLink(url).then(p => {
  console.log('\n解析成功:');
  console.log(JSON.stringify(p, null, 2));
}).catch(e => {
  console.error('\n❌', e.message);
});