import translate from 'google-translate-api-x';

export default async function handler(req, res) {
    // Настройки доступа (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Если это предварительный запрос браузера — отвечаем ОК
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query } = req.body;
    
    // Проверка, что запрос не пустой
    if (!query) return res.status(400).json({ answer: "Пожалуйста, введите запрос." });

    try {
        // 1. Ищем ID статей в базе PubMed
        // retmax=5 ограничивает выдачу 5 статьями (можно поменять на 10)
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(query)}&sort=relevance&retmax=5`;
        
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const ids = searchData.esearchresult.idlist;

        // Если ничего не нашли
        if (!ids || ids.length === 0) {
            return res.status(200).json({ answer: `По запросу **"${query}"** ничего не найдено в базе PubMed.` });
        }

        // 2. Получаем подробную информацию по найденным ID
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
        const sumRes = await fetch(summaryUrl);
        const sumData = await sumRes.json();
        const articles = sumData.result;

        // Начало ответа
        let markdownResponse = `### Результаты для: "${query}"\n\n`;

        // 3. Перебираем статьи, переводим и формируем список
        for (const id of ids) {
            const article = articles[id];
            if (article) {
                let title = article.title || "Без названия";
                
                // --- БЛОК ПЕРЕВОДА ---
                try {
                    const translation = await translate(title, { to: 'ru' });
                    // Если перевод успешен, заменяем английский заголовок на русский
                    title = translation.text; 
                } catch (e) {
                    console.error("Не удалось перевести заголовок:", e);
                    // Если перевод сломался, останется английский заголовок
                }
                // ---------------------

                const link = `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
                const date = article.pubdate || "Дата не указана";
                const source = article.source || "Источник не указан";

                // Формируем красивую ссылку HTML, чтобы открывалась в новой вкладке (target="_blank")
                markdownResponse += `<a href="${link}" target="_blank" style="font-weight:bold; color:#5896A6; text-decoration:none; font-size: 18px;">${title}</a>\n`;
                markdownResponse += `<div style="margin-bottom: 5px; color: #555;"><i>${source}, ${date}</i></div>`;
                markdownResponse += `ID: ${id}\n`;
                markdownResponse += `---\n\n`; // Разделитель
            }
        }

        // Итог внизу
        markdownResponse += `*Найдено ${searchData.esearchresult.count} публикаций. Показаны топ-5.*`;

        // Отправляем ответ на фронтенд
        res.status(200).json({ answer: markdownResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: "Произошла ошибка при поиске статей. Попробуйте позже." });
    }
}
