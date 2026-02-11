export default async function handler(req, res) {
    // Настройки доступа (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query } = req.body;
    if (!query) return res.status(400).json({ answer: "Пожалуйста, введите запрос." });

    try {
        // 1. Ищем ID статей
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(query)}&sort=relevance&retmax=5`;
        
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const ids = searchData.esearchresult.idlist;

        if (!ids || ids.length === 0) {
            return res.status(200).json({ answer: `По запросу **"${query}"** ничего не найдено в базе PubMed.` });
        }

        // 2. Получаем детали статей
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
        const sumRes = await fetch(summaryUrl);
        const sumData = await sumRes.json();
        const articles = sumData.result;

        let markdownResponse = `### Результаты для: "${query}"\n\n`;

        // 3. Переводим и формируем ответ
        for (const id of ids) {
            const article = articles[id];
            if (article) {
                let title = article.title || "Без названия";
                
                // --- НОВЫЙ БЛОК ПЕРЕВОДА (MyMemory API) ---
                try {
                    // Используем бесплатный API MyMemory вместо Google
                    const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(title)}&langpair=en|ru`;
                    const transRes = await fetch(translateUrl);
                    const transData = await transRes.json();
                    
                    if (transData.responseData && transData.responseData.translatedText) {
                        title = transData.responseData.translatedText;
                    }
                } catch (e) {
                    console.error("Ошибка перевода:", e);
                }
                // -------------------------------------------

                const link = `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
                const date = article.pubdate || "";
                const source = article.source || "";

                // Используем HTML тег <a> с target="_blank" для открытия в новой вкладке
                // Добавляем !important к стилям, чтобы Тильда не перекрывала их
                markdownResponse += `<a href="${link}" target="_blank" style="font-size: 18px; font-weight: bold; color: #5896A6 !important; text-decoration: none; border-bottom: 1px solid #5896A6;">${title}</a>\n\n`;
                markdownResponse += `<div style="font-size: 14px; color: #666; margin-bottom: 15px;"><i>${source}, ${date}</i></div>\n`;
                markdownResponse += `ID: ${id}\n`;
                markdownResponse += `---\n\n`;
            }
        }

        markdownResponse += `*Найдено ${searchData.esearchresult.count} публикаций. Показаны топ-5.*`;
        res.status(200).json({ answer: markdownResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: "Ошибка сервера при обработке запроса." });
    }
}
