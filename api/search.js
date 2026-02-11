export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query, page = 1, filters } = req.body;
    
    if (!query) return res.status(400).json({ error: "Введите запрос." });

    try {
        // --- 1. КОНСТРУКТОР ЗАПРОСА ---
        let searchTerm = `(${query})`;

        // Если переданы фильтры
        if (filters) {
            // 1. Даты (Date Range)
            if (filters.minYear || filters.maxYear) {
                const min = filters.minYear || 1900;
                const max = filters.maxYear || new Date().getFullYear();
                searchTerm += ` AND ${min}:${max}[dp]`;
            }

            // 2. Тип текста (Text Availability)
            if (filters.freeFullText) searchTerm += ` AND "loattrfree full text"[sb]`;
            if (filters.fullText) searchTerm += ` AND "loattrfull text"[sb]`;
            if (filters.abstract) searchTerm += ` AND "hasabstract"[text]`;

            // 3. Тип статьи (Article Type) - объединяем через OR
            // Пример: AND (Clinical Trial[pt] OR Review[pt])
            if (filters.articleTypes && filters.articleTypes.length > 0) {
                const types = filters.articleTypes.map(t => `"${t}"[pt]`).join(' OR ');
                searchTerm += ` AND (${types})`;
            }

            // 4. Язык (Language)
            if (filters.languages && filters.languages.length > 0) {
                const langs = filters.languages.map(l => `"${l}"[la]`).join(' OR ');
                searchTerm += ` AND (${langs})`;
            }

            // 5. Вид (Species)
            if (filters.species) {
                if (filters.species.includes('humans')) searchTerm += ` AND "humans"[mh]`;
                if (filters.species.includes('animals')) searchTerm += ` AND "animals"[mh:noexp]`;
            }

            // 6. Пол (Sex)
            if (filters.sex) {
                if (filters.sex.includes('female')) searchTerm += ` AND "female"[mh]`;
                if (filters.sex.includes('male')) searchTerm += ` AND "male"[mh]`;
            }

            // 7. Возраст (Age)
            if (filters.age && filters.age.length > 0) {
                 const ages = filters.age.map(a => `"${a}"[mh]`).join(' OR ');
                 searchTerm += ` AND (${ages})`;
            }
        }

        // Пагинация
        const retmax = 10;
        const retstart = (page - 1) * retmax;

        // --- 2. ПОИСК ---
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(searchTerm)}&sort=relevance&retstart=${retstart}&retmax=${retmax}`;
        
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (!searchData.esearchresult || !searchData.esearchresult.idlist.length) {
            return res.status(200).json({ total: 0, articles: [] });
        }

        const ids = searchData.esearchresult.idlist;
        const totalCount = searchData.esearchresult.count;

        // --- 3. ДЕТАЛИ ---
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
        const sumRes = await fetch(summaryUrl);
        const sumData = await sumRes.json();
        const rawArticles = sumData.result;

        // --- 4. ПЕРЕВОД ---
        const processedArticles = [];

        for (const id of ids) {
            const item = rawArticles[id];
            if (!item) continue;

            let titleRus = item.title;
            try {
                const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(item.title)}&langpair=en|ru`;
                const transRes = await fetch(translateUrl);
                const transData = await transRes.json();
                if (transData.responseData?.translatedText) {
                    titleRus = transData.responseData.translatedText;
                }
            } catch (e) { console.error(e); }

            let authorsStr = "";
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
