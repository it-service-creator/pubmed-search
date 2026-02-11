export default async function handler(req, res) {
    // Настройки CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query, minYear, maxYear, freeFullText, page = 1 } = req.body;
    
    if (!query) return res.status(400).json({ error: "Введите запрос." });

    try {
        // --- 1. СБОРКА СЛОЖНОГО ЗАПРОСА ДЛЯ PUBMED ---
        let searchTerm = `(${query})`;

        // Фильтр: Даты (год)
        if (minYear || maxYear) {
            const min = minYear || 1900;
            const max = maxYear || new Date().getFullYear();
            searchTerm += ` AND ${min}:${max}[dp]`;
        }

        // Фильтр: Бесплатный полный текст
        if (freeFullText) {
            searchTerm += ` AND "loattrfree full text"[sb]`;
        }

        // Пагинация (с какой статьи начинать)
        const retmax = 10; // Сколько статей на странице
        const retstart = (page - 1) * retmax;

        // --- 2. ПОИСК ID (ESearch) ---
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(searchTerm)}&sort=relevance&retstart=${retstart}&retmax=${retmax}`;
        
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (!searchData.esearchresult || !searchData.esearchresult.idlist.length) {
            return res.status(200).json({ total: 0, articles: [] });
        }

        const ids = searchData.esearchresult.idlist;
        const totalCount = searchData.esearchresult.count;

        // --- 3. ПОЛУЧЕНИЕ ДЕТАЛЕЙ (ESummary) ---
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
        const sumRes = await fetch(summaryUrl);
        const sumData = await sumRes.json();
        const rawArticles = sumData.result;

        // --- 4. ПЕРЕВОД И ФОРМИРОВАНИЕ JSON ---
        const processedArticles = [];

        for (const id of ids) {
            const item = rawArticles[id];
            if (!item) continue;

            let titleRus = item.title;
            
            // Пробуем перевести заголовок
            try {
                const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.title)}&langpair=en|ru`;
                const transRes = await fetch(translateUrl);
                const transData = await transRes.json();
                if (transData.responseData?.translatedText) {
                    titleRus = transData.responseData.translatedText;
                }
            } catch (e) {
                console.error("Translation error", e);
            }

            // Формируем список авторов (берем первых 3)
            let authorsStr = "Authors not listed";
            if (item.authors && item.authors.length > 0) {
                authorsStr = item.authors.slice(0, 3).map(a => a.name).join(", ");
                if (item.authors.length > 3) authorsStr += " et al.";
            }

            processedArticles.push({
                id: id,
                titleEn: item.title,
                titleRu: titleRus,
                authors: authorsStr,
                source: item.source,
                pubdate: item.pubdate,
                link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
            });
        }

        // Возвращаем чистый JSON, а не готовый HTML
        res.status(200).json({
            total: totalCount,
            page: page,
            articles: processedArticles
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
}
