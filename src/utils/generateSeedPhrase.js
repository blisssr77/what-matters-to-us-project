import wordList from './wordlist.json';

export function generateSeedPhrase(numWords = 10) {
    const selected = [];
    for (let i = 0; i < numWords; i++) {
        const index = Math.floor(Math.random() * wordList.length);
        selected.push(wordList[index]);
    }
    return selected;
}
