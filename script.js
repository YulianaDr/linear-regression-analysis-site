Chart.register(ChartZoom);
let regressionChart = null;
const { jsPDF } = window.jspdf;

// Инициализация всех обработчиков событий
document.addEventListener("DOMContentLoaded", () => {

  // Обработка ручного ввода
  document
    .getElementById("manualForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();

      // Универсальный обработчик ввода
      const parseInput = (input) => {
        return input
          .split(/[\s,;]+/) // Разделяем пробелом, запятой или точкой с запятой
          .map((val) => {
            // Удаляем все лишние символы, кроме цифр, точек и минуса
            const cleaned = val.replace(/[^\d.-]/g, "");
            return parseFloat(cleaned);
          })
          .filter((v) => !isNaN(v)); // Фильтруем нечисловые значения
      };

      const x = parseInput(e.target.x.value);
      const y = parseInput(e.target.y.value);

      processData(x, y);
    });

  // Загрузка файла
  document
    .getElementById("fileInput")
    .addEventListener("change", handleFileUpload);

  // Экспорт PNG
  document.getElementById("exportPNG").addEventListener("click", exportPNG);

  // Экспорт PDF
  document.getElementById("exportPDF").addEventListener("click", exportPDF);

  // Сброс данных
  document.getElementById("resetData").addEventListener("click", resetData);

  // Cброс масштаба
  document.getElementById("resetZoom").addEventListener("click", function () {
    resetZoom();
    // Дополнительно сбрасываем до исходного вида
    if (regressionChart) {
      regressionChart.options.scales.x.min = undefined;
      regressionChart.options.scales.x.max = undefined;
      regressionChart.options.scales.y.min = undefined;
      regressionChart.options.scales.y.max = undefined;
      regressionChart.update();
    }
  });

  document.getElementById("showHelp").addEventListener("click", function () {
    const helpSection = document.getElementById("dataFormatHelp");
    helpSection.classList.toggle("hidden");
    this.textContent = helpSection.classList.contains("hidden")
      ? "Показать требования к данным"
      : "Скрыть требования";
  });

  document
    .getElementById("manualForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      const x = e.target.x.value
        .split(/[\s,;]+/)
        .map((val) => parseFloat(val.replace(",", ".")))
        .filter((v) => !isNaN(v));
      const y = e.target.y.value
        .split(/[\s,;]+/)
        .map((val) => parseFloat(val.replace(",", ".")))
        .filter((v) => !isNaN(v));
      processData(x, y);
    });
});

function resetZoom() {
  if (regressionChart) {
    regressionChart.resetZoom();
    regressionChart.update();
  }
}

// Функция сброса данных
function resetData() {
  if (regressionChart) {
    regressionChart.destroy();
    regressionChart = null;
  }
  document.getElementById("manualForm").reset();
  document.getElementById("fileInput").value = "";
  document.getElementById("equation").innerHTML =
    'Уравнение: <span class="formula">y = ax + b</span>';
  document.getElementById("r2").innerHTML =
    'R² (точность): <span class="value">0</span>';
  document.getElementById("error").textContent = "";
}

// Обработка файла
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = function (e) {
        parseExcel(e.target.result);
      };
      reader.readAsArrayBuffer(file); // Для Excel читаем как ArrayBuffer
    } else if (file.name.endsWith(".csv")) {
      reader.onload = function (e) {
        parseCSV(e.target.result);
      };
      reader.readAsText(file, "UTF-8");
    } else if (file.name.endsWith(".txt")) {
      reader.onload = function (e) {
        parseTXT(e.target.result);
      };
      reader.readAsText(file, "UTF-8");
    } else {
      showError("Неподдерживаемый формат файла");
    }
  };
  reader.readAsText(file); // Читаем как текст (для TXT)
}

// Парсер для TXT (из блокнота)
function parseTXT(data) {
  try {
    // Универсальная обработка разделителей: запятая, точка с запятой, пробел, табуляция
    const separatorRegex = /[\s,;]+/;

    // Разделяем на строки и фильтруем пустые
    const lines = data.split(/\r?\n/).filter((line) => line.trim() !== "");

    // Если данные в одной строке
    if (lines.length === 1) {
      const values = lines[0].split(separatorRegex).filter((val) => val !== "");

      if (values.length % 2 !== 0) {
        showError("Нечетное количество значений в строке");
        return;
      }

      const x = [];
      const y = [];

      for (let i = 0; i < values.length; i += 2) {
        x.push(parseFloat(values[i].replace(",", ".")));
        y.push(parseFloat(values[i + 1].replace(",", ".")));
      }

      processData(x, y);
    }
    // Если данные построчно
    else {
      const points = [];

      for (const line of lines) {
        const values = line.split(separatorRegex).filter((val) => val !== "");
        if (values.length >= 2) {
          points.push({
            x: parseFloat(values[0].replace(",", ".")),
            y: parseFloat(values[1].replace(",", ".")),
          });
        }
      }

      if (points.length === 0) {
        showError("Не удалось прочитать данные из файла");
        return;
      }

      processData(
        points.map((p) => p.x),
        points.map((p) => p.y)
      );
    }
  } catch (e) {
    showError("Ошибка чтения файла: " + e.message);
  }
}

// Парсинг CSV
function parseCSV(data) {
  // Сначала пробуем определить разделитель
  const firstLine = data.split("\n")[0];
  let delimiter = firstLine.includes(";")
    ? ";"
    : firstLine.includes(",")
    ? ","
    : firstLine.includes("\t")
    ? "\t"
    : ",";

  Papa.parse(data, {
    delimiter: delimiter,
    header: false,
    skipEmptyLines: true,
    complete: function (results) {
      const rows = results.data.filter((row) => row.length >= 2);

      if (rows.length === 0) {
        showError(
          `CSV должен содержать два столбца (X и Y), разделенных "${delimiter}"`
        );
        return;
      }

      const x = [];
      const y = [];

      rows.forEach((row) => {
        if (row.length >= 2) {
          const xVal = parseFloat(String(row[0]).replace(",", "."));
          const yVal = parseFloat(String(row[1]).replace(",", "."));

          if (!isNaN(xVal)) x.push(xVal);
          if (!isNaN(yVal)) y.push(yVal);
        }
      });

      if (x.length !== y.length) {
        showError("Количество X и Y не совпадает");
        return;
      }

      if (x.length === 0) {
        showError("Не найдено числовых данных");
        return;
      }

      processData(x, y);
    },
    error: function (error) {
      showError("Ошибка чтения CSV: " + error.message);
    },
  });
}

// Парсинг Excel
function parseExcel(data) {
  try {
    // Читаем файл как ArrayBuffer
    const arrayBuffer = new Uint8Array(data).buffer;
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Берем первый лист
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    // Преобразуем в JSON (массив массивов)
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

    // Фильтруем пустые строки
    const filtered = rows.filter((row) => row && row.length >= 2);

    if (filtered.length === 0) {
      showError("Файл должен содержать два столбца (X и Y)");
      return;
    }

    // Проверяем, есть ли заголовки (если первая строка - не числа)
    const hasHeaders =
      isNaN(parseFloat(String(filtered[0][0]).replace(",", "."))) ||
      isNaN(parseFloat(String(filtered[0][1]).replace(",", ".")));
    const startRow = hasHeaders ? 1 : 0;

    const x = [];
    const y = [];

    for (let i = startRow; i < filtered.length; i++) {
      const row = filtered[i];
      if (row && row.length >= 2) {
        // Обрабатываем дробные числа с запятой
        const xVal = parseFloat(String(row[0]).replace(",", "."));
        const yVal = parseFloat(String(row[1]).replace(",", "."));

        if (!isNaN(xVal)) x.push(xVal);
        if (!isNaN(yVal)) y.push(yVal);
      }
    }

    if (x.length !== y.length) {
      showError("Количество X и Y не совпадает");
      return;
    }

    if (x.length === 0) {
      showError("Не найдено числовых данных");
      return;
    }

    processData(x, y);
  } catch (e) {
    showError("Ошибка чтения Excel: " + e.message);
  }
}

// Расчёт регрессии и R²
function linearRegression(x, y) {
  const n = x.length;

  // 1. Вычисление сумм
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

   // 2. Вычисление коэффициентов
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX); //a (slope) - наклон линии
  const intercept = (sumY - slope * sumX) / n; // b (intercept) - точка пересечения с осью Y

   // 3. Вычисляем коэффициент детерминации R²
  const r2 = Math.pow(
    (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)),
    2
  );

  return { slope, intercept, r2 };
}

// Отрисовка графика с анимацией
function drawChart(x, y, slope, intercept) {
  const ctx = document.getElementById("regressionChart").getContext("2d");

  if (regressionChart) regressionChart.destroy();

  // Создаем данные для графика
  const data = {
    datasets: [
      {
        label: "Данные",
        data: x.map((xi, i) => ({ x: xi, y: y[i] })),
        backgroundColor: "#e74c3c",
        pointRadius: 6,
      },
      {
        label: "Регрессия",
        data: x.map((xi) => ({ x: xi, y: slope * xi + intercept })),
        type: "line",
        borderColor: "#3498db",
        borderWidth: 3,
        fill: false,
        pointRadius: 0,
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 2000,
      easing: "easeOutQuart",
    },
    interaction: {
      mode: "nearest",
      intersect: false,
    },
    plugins: {
      zoom: {
        pan: {
          enabled: true,
          mode: "xy",
          modifierKey: null,
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: "xy",
        },
      },
      legend: {
        position: "top",
      },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `(${ctx.parsed.x.toFixed(2)}, ${ctx.parsed.y.toFixed(2)})`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        position: "bottom",
        title: {
          display: true,
          text: "X",
        },
        grid: {
          color: "rgba(200, 200, 200, 0.2)",
        },
      },
      y: {
        title: {
          display: true,
          text: "Y",
        },
        grid: {
          color: "rgba(200, 200, 200, 0.2)",
        },
      },
    },
  };

  regressionChart = new Chart(ctx, {
    type: "scatter",
    data: data,
    options: options,
    plugins: [ChartZoom], // Явно указываем плагин
  });
}

// Экспорт PNG
function exportPNG() {
  if (!regressionChart) return;
  const url = regressionChart.toBase64Image();
  const link = document.createElement("a");
  link.href = url;
  link.download = "регрессия.png";
  link.click();
}

// Экспорт PDF
function exportPDF() {
  if (!regressionChart) return;
  const canvas = document.getElementById("regressionChart");
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("landscape");
  pdf.addImage(imgData, "PNG", 10, 10, 280, 150);
  pdf.save("регрессия.pdf");
}

// Обновление статистики
function updateStats(slope, intercept, r2) {
  document.getElementById(
    "equation"
  ).innerHTML = `Уравнение: <span class="formula">y = ${slope.toFixed(
    2
  )}x + ${intercept.toFixed(2)}</span>`;
  document.getElementById(
    "r2"
  ).innerHTML = `R² (точность): <span class="value">${r2.toFixed(4)}</span>`;
}

// Обработка данных
function processData(x, y) {
  // Проверяем, что есть данные
  if (x.length === 0 || y.length === 0) {
    showError("Нет данных для построения графика. Проверьте формат файла.");
    return;
  }

  // Показываем предупреждение, если есть NaN значения
  const xNaN = x.filter((v) => isNaN(v)).length;
  const yNaN = y.filter((v) => isNaN(v)).length;

  if (xNaN > 0 || yNaN > 0) {
    showError(
      `Обнаружено ${
        xNaN + yNaN
      } некорректных значений. Они будут проигнорированы.`
    );
  }

  // Фильтруем NaN значения
  const cleanX = x.filter((v) => !isNaN(v));
  const cleanY = y.filter((v) => !isNaN(v));

  if (cleanX.length !== cleanY.length) {
    showError("Количество X и Y не совпадает после очистки данных");
    return;
  }

  if (cleanX.length === 0) {
    showError("Нет валидных данных для построения графика");
    return;
  }

  const { slope, intercept, r2 } = linearRegression(cleanX, cleanY);
  drawChart(cleanX, cleanY, slope, intercept);
  updateStats(slope, intercept, r2);
}

// Вывод ошибки
function showError(message) {
  document.getElementById("error").textContent = message;
  if (regressionChart) regressionChart.destroy();
}

//Функция для проверки числовых значений
function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}
