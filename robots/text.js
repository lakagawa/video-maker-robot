const algorithmia = require("algorithmia");
const algorithmiaApiKey = require("./../credentials/algorithmia.json").apiKey;
const sentenceBoundaryDetection = require("sbd");
const watsonApiKey = require("../credentials/watson-nlu.json").apikey;
const NaturalLanguageUnderstandingV1 = require("ibm-watson/natural-language-understanding/v1");
const { IamAuthenticator } = require("ibm-watson/auth");
const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
  version: "2019-07-12",
  authenticator: new IamAuthenticator({
    apikey: watsonApiKey
  }),
  url: "https://gateway.watsonplatform.net/natural-language-understanding/api/"
});
const state = require('./state')


async function robot() {
    const content = state.load()
    await fetchContentWikipedia(content)
    sanitizeContent(content)
    breakIntoSentences(content)
    limitMaximumSentences(content)
    await fetchKeywordsOfAllSentences(content)

    state.save(content)
  
    async function fetchContentWikipedia(content) {
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
        const wikipediaAlgorithm = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2?timeout=300')
        const wikipediaReponse = await wikipediaAlgorithm.pipe(content.searchTerm)
        const wikipediaContent = wikipediaReponse.get()
        content.sourceContentOriginal = wikipediaContent.content
    }

    function sanitizeContent(content) {
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkDown(content.sourceContentOriginal)
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
        content.sourceContentSanitized = withoutDatesInParentheses
        function removeBlankLinesAndMarkDown(text) {
            const allLines = text.split('\n')
            const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
                if(line.trim().length ===0 || line.trim().startsWith('=')){
                    return false
                }
                return true
            })
            return withoutBlankLinesAndMarkdown.join(' ')
        }
        function removeDatesInParentheses(text) {
            return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ')
        }
    }

    function breakIntoSentences(content) {
        content.sentences = []
        const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)
        sentences.forEach((sentence) => {
            content.sentences.push({
                text: sentence,
                keyword: [],
                images: []
            })
        })
    }

    function limitMaximumSentences(content) {
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }

    async function fetchKeywordsOfAllSentences(content) {
        for(const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
        }
    }

    async function fetchWatsonAndReturnKeywords(sentence) {
        const response = await naturalLanguageUnderstanding
        .analyze({
            text: sentence,
            features: {
            keywords: {}
            }
        })
        if(response.err){
            throw response.err
        }

        const keywords = response.result.keywords.map(keyword => {
                    return keyword.text
                    })
        return keywords
    }
}


module.exports = robot;
