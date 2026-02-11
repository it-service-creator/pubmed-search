// api/search.js
export default async function handler(req, res) {
    // Настройка CORS, чтобы запросы проходили
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ answer: "Пожалуйста, введите поисковый запрос." });
    }

    try {
        // 1. Поиск ID статей (ESearch)
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(query)}&sort=relevance&retmax=5`;
        
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        const ids = searchData.esearchresult.idlist;

        if (!ids || ids.length === 0) {
            return res.status(200).json({ 
                answer: `По запросу **"${query}"** ничего не найдено в базе PubMed.` 
            });
        }

        // 2. Получение деталей статей (ESummary)
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
        const summaryResponse = await fetch(summaryUrl);
        const summaryData = await summaryResponse.json();
        const articles = summaryData.result;

        // 3. Формирование красивого ответа (Markdown)
        let markdownResponse = `### Результаты поиска по запросу: "${query}"\n\n`;

        ids.forEach((id) => {
            const article = articles[id];
            if (article) {
                const title = article.title || "Без названия";
                const date = article.pubdate || "Дата не указана";
                const source = article.source || "Журнал не указан";
                const link = `https://pubmed.ncbi.nlm.nih.gov/${id}/`;

                // Формируем блок для каждой статьи
                markdownResponse += `**[${title}](${link})**\n`;
                markdownResponse += `*${source}, ${date}*\n\n`;
                markdownResponse += `ID: ${id}\n`;
                markdownResponse += `---\n`; // Разделитель
            }
        });

        markdownResponse += `\n*Найдено ${searchData.esearchresult.count} публикаций. Показаны топ-5.*`;

        res.status(200).json({ answer: markdownResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: "Произошла ошибка при обращении к PubMed API." });
    }
}