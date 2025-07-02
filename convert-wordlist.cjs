const fs = require('fs');

const text = fs.readFileSync('./src/utils/wordlist.txt', 'utf-8');
const words = text.split('\n').filter(Boolean); // one word per line

fs.writeFileSync('./src/utils/wordlist.json', JSON.stringify(words, null, 2));
console.log('✅ Converted wordlist.txt → wordlist.json');