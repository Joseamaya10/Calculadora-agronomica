/*
   * ================================================================
   *  CALCULADORA AGRONÓMICA: NUTRICIÓN Y ENMIENDAS DE SUELO (v2)
   *  Cambios clave:
   *   - Base de datos de cultivos ampliada (algodón, fríjol caupí, palma, arroz).
   *   - Base de fertilizantes con contenidos completos y precios referenciales.
   *   - Flujo correcto: primero P y K → descuenta N de MAP/DAP → completa N con urea.
   *   - Costeo por ha y total (con área).
   *   - Calendario de aplicaciones y manejo para reducir pérdidas (volatilización, lixiviación, escorrentía).
   * ================================================================
   */

  // ----------------------------
  // Base de datos de cultivos
  // ----------------------------
  const CULTIVOS = {
    maiz: {
      nombre: "Maíz (grano)",
      N_requerimiento: 150,
      P_obj_ppm: 25,
      K_obj_ppm: 250
    },
    pastos: {
      nombre: "Pastos (forrajeros)",
      N_requerimiento: 100,
      P_obj_ppm: 20,
      K_obj_ppm: 200
    },
    hortalizas: {
      nombre: "Hortalizas (intensivo)",
      N_requerimiento: 180,
      P_obj_ppm: 35,
      K_obj_ppm: 300
    },
    algodon: {
      nombre: "Algodón",
      N_requerimiento: 200,
      P_obj_ppm: 22,
      K_obj_ppm: 220
    },
    frijol_caupi: {
      nombre: "Fríjol Caupí",
      N_requerimiento: 40,   // leguminosa: bajo N externo
      P_obj_ppm: 18,
      K_obj_ppm: 200
    },
    palma: {
      nombre: "Palma de Aceite",
      N_requerimiento: 250,
      P_obj_ppm: 25,
      K_obj_ppm: 300
    },
    arroz: {
      nombre: "Arroz",
      N_requerimiento: 120,
      P_obj_ppm: 20,
      K_obj_ppm: 180
    }
  };

  // ----------------------------
  // Base de fertilizantes (contenido y precios)
  //  precios referenciales por kg (ajusta a tu mercado)
  // ----------------------------
  const FERT = {
    Urea:      { N:46, P2O5:0,  K2O:0,  precioUSD:0.8,  manejo:"Altamente volátil en superficie; fracciona y/o incorpora; evitar mezclar con cal en el mismo pase." },
    MAP:       { N:11, P2O5:52, K2O:0,  precioUSD:1.2,  manejo:"Fuente de N y P; ideal en siembra localizando cerca de la semilla; incorporar mejora eficiencia." },
    DAP:       { N:18, P2O5:46, K2O:0,  precioUSD:1.1,  manejo:"Concentrado de N y P; evitar contacto directo con semilla; incorporar o aplicar bandado." },
    KCl:       { N:0,  P2O5:0,  K2O:60, precioUSD:0.9,  manejo:"Puede aumentar salinidad; fraccionar en suelos arenosos/baja CICE; evitar acumulación superficial." },
    "Cal Agrícola": { N:0, P2O5:0, K2O:0, CaCO3:100, precioUSD:0.1, manejo:"Aplicar previo a siembra e incorporar a 0–20 cm; granulometría fina reacciona más rápido." },
    Azufre:    { N:0,  P2O5:0,  K2O:0,  S:100, precioUSD:0.7, manejo:"Oxida lentamente; requiere humedad y temperatura; incorporar; monitorear pH." }
  };

  // Eficiencias de uso (nutriente disponible para el cultivo en la campaña)
  const EF = { N:0.50, P2O5:0.30, K2O:0.50 };

  // Conversión: 1 ppm ≈ 2 kg/ha en 0–20 cm (BD≈1.3)
  const PPM_to_KGHA = 2;

  // Utiles de formato
  const fmt1 = (x)=> isFinite(x) ? (Math.round(x*100)/100).toLocaleString('es-CO') : "—";
  const fmt2 = (x)=> isFinite(x) ? (Math.round(x*100)/100).toLocaleString('es-CO') : "—";

  // Utilidad para formato de moneda
  function fmtMoneda(x, moneda) {
    if (!isFinite(x)) return "—";
    if (moneda === "COP") return "$" + Math.round(x).toLocaleString("es-CO") + " COP";
    return "$" + (Math.round(x * 100) / 100).toLocaleString("en-US") + " USD";
  }

  // Calendario y manejo por cultivo (orientativo; ajustar por zona/fecha de siembra)
  const CAL = {
    maiz: {
      N: "Fraccionar: 30% en siembra, 40% en V6, 30% en prefloración.",
      P: "Todo en la siembra, bandado a 5 cm de la línea y 5 cm profundo.",
      K: "50% en siembra y 50% en V6. En suelos arenosos, 3 fracciones."
    },
    pastos: {
      N: "Aplicaciones después de cada corte o pastoreo (3–4 eventos/año).",
      P: "Todo al establecimiento; en mantenimiento, 1 aplicación anual.",
      K: "2–3 fracciones/año según precipitación."
    },
    hortalizas: {
      N: "4–6 eventos vía fertirriego o voleo fraccionado.",
      P: "Predominantemente a la siembra, localizando.",
      K: "3–5 fracciones; aumentar dosis cercanas a fructificación."
    },
    algodon: {
      N: "40% siembra, 30% botón floral, 30% floración.",
      P: "Principalmente a la siembra, bandado.",
      K: "2–3 fracciones entre establecimiento y floración."
    },
    frijol_caupi: {
      N: "N inicial bajo (arranque); inoculación recomendada.",
      P: "A la siembra, localizado.",
      K: "2 fracciones si suelos de baja CICE."
    },
    palma: {
      N: "4 fracciones/año en el plato; ajustar por producción/edad.",
      P: "Aplicar en épocas de lluvia; 2 fracciones/año.",
      K: "4 fracciones/año; evitar pérdidas por escorrentía."
    },
    arroz: {
      N: "50% presiembra/implantación y 50% macollamiento.",
      P: "Todo en presiembra incorporado.",
      K: "60% presiembra, 40% macollamiento."
    }
  };

  // ----------------------------
  // Lectura segura y validación
  // ----------------------------
  function readNum(id){
    const el = document.getElementById(id);
    const v = parseFloat(String(el.value).replace(",", "."));
    return isFinite(v) ? v : NaN;
  }

  function validarEntradas(){
    const ph = readNum("ph");
    const mo = readNum("mo");
    const p_ppm = readNum("p_ppm");
    const k_ppm = readNum("k_ppm");
    const ca = readNum("ca");
    const mg = readNum("mg");
    const area = readNum("area");
    const errs = [];
    if (isNaN(ph) || ph<3.5 || ph>9.5) errs.push("pH entre 3.5 y 9.5");
    if (isNaN(mo) || mo<0 || mo>20) errs.push("MO% entre 0 y 20");
    if (isNaN(p_ppm) || p_ppm<0 || p_ppm>200) errs.push("P (ppm) entre 0 y 200");
    if (isNaN(k_ppm) || k_ppm<0 || k_ppm>800) errs.push("K (ppm) entre 0 y 800");
    if (isNaN(ca) || ca<0 || ca>40) errs.push("Ca (meq/100g) entre 0 y 40");
    if (isNaN(mg) || mg<0 || mg>20) errs.push("Mg (meq/100g) entre 0 y 20");
    if (isNaN(area) || area<=0 || area>10000) errs.push("Área (ha) > 0 y ≤ 10,000");
    return { ok: errs.length===0, ph, mo, p_ppm, k_ppm, ca, mg, area, errs };
  }

  // ----------------------------
  // Diagnóstico pH y enmiendas
  // ----------------------------
  function diagnosticoPh(ph){
    if (ph<5.0) return {tag:"Ácido fuerte", cls:"danger"};
    if (ph<5.5) return {tag:"Ácido medio", cls:"warn"};
    if (ph<6.0) return {tag:"Ácido leve", cls:"warn"};
    if (ph<=7.5) return {tag:"Casi neutro a ligeramente alcalino", cls:"good"};
    if (ph<=8.2) return {tag:"Alcalino moderado", cls:"warn"};
    return {tag:"Alcalino fuerte", cls:"danger"};
  }

  function calcularEnmiendas(ph, mo, ca, mg){
    const bufferProxy = (ca + mg);
    const ajustes = {
      buffer: bufferProxy>12 ? 1.10 : 1.00,
      MO: mo>5 ? 1.10 : 1.00
    };
    let cal_t_ha = 0;
    let s_t_ha = 0;

    if (ph < 6.0){
      const base = Math.max(0, (6.5 - ph) * 2);            // t/ha por unidad de pH
      cal_t_ha = Math.min(6, base * ajustes.buffer * ajustes.MO);
    } else if (ph > 7.5){
      const base = Math.max(0, (ph - 7.5) * 0.8);          // t/ha por unidad de pH
      s_t_ha = Math.min(2.5, base * ajustes.buffer);
    }
    return { cal_t_ha, s_t_ha, detalles: {bufferProxy, ajustes} };
  }

  // ----------------------------
  // Cálculos de nutrientes y productos
  //  Nota: primero P y K; luego se completa N (descontando N proveniente de MAP/DAP).
  // ----------------------------
  function calcularPK(cultivoKey, p_ppm, k_ppm, srcP, srcK){
    const P_obj = CULTIVOS[cultivoKey].P_obj_ppm;
    const K_obj = CULTIVOS[cultivoKey].K_obj_ppm;

    // Déficits en ppm
    const defP_ppm = Math.max(0, P_obj - p_ppm);
    const defK_ppm = Math.max(0, K_obj - k_ppm);

    // Déficits en kg/ha equivalentes en suelo
    const defP_kg_ha = defP_ppm * PPM_to_KGHA;
    const defK_kg_ha = defK_ppm * PPM_to_KGHA;

    // Nutriente a aplicar (corrigiendo por eficiencia de uso)
    const req_P2O5 = defP_kg_ha / EF.P2O5;   // kg P2O5/ha a aplicar
    const req_K2O  = defK_kg_ha / EF.K2O;    // kg K2O/ha a aplicar

    // Producto seleccionado para P
    const fertP = FERT[srcP];
    const fertK = FERT[srcK];

    const kg_fertP = req_P2O5 / (fertP.P2O5/100); // kg/ha del producto de P
    const kg_fertK = req_K2O  / (fertK.K2O/100);  // kg/ha del producto de K

    // N aportado por el fertilizante fosfatado (MAP/DAP)
    const N_from_P = kg_fertP * (fertP.N/100);

    return {
      P_obj, K_obj,
      defP_ppm, defP_kg_ha, req_P2O5, kg_fertP,
      defK_ppm, defK_kg_ha, req_K2O,  kg_fertK,
      N_from_P,
      srcP, srcK
    };
  }

  function calcularNfinal(cultivoKey, mo, N_from_P){
    // Aporte por MO (regla práctica; limitar para no sobreestimar)
    const N_aporte_MO = Math.min(20 * mo, 140);
    const N_req = CULTIVOS[cultivoKey].N_requerimiento;

    // Déficit neto tras restar MO y N proveniente del fosfatado
    const N_neto = Math.max(0, N_req - N_aporte_MO - N_from_P);

    // N como fertilizante (por eficiencia)
    const N_fert = N_neto / EF.N;

    // Equivalente en urea
    const urea_kg_ha = N_fert / (FERT.Urea.N/100);

    return { N_aporte_MO, N_req, N_neto, N_fert, urea_kg_ha };
  }

  // ----------------------------
  // Costos
  // ----------------------------
  function costos(kg_fertP, srcP, kg_fertK, srcK, urea_kg_ha, enm, area, moneda){
    // Tasa de conversión muy simplificada para mostrar COP/ USD (ajusta según tasa real si lo deseas)
    const rate = (moneda==="COP") ? 4200 : 1; // Referencial
    const items = [];

    const add = (name, kg_ha, priceUSD)=>{
      const costo_ha_usd = kg_ha * priceUSD;
      const costo_ha = costo_ha_usd * (moneda==="COP" ? rate : 1);
      const costo_total = costo_ha * area;
      items.push({ name, kg_ha, costo_ha_usd, costo_ha, costo_total });
    };

    if (kg_fertP>0) add(srcP, kg_fertP, FERT[srcP].precioUSD);
    if (kg_fertK>0) add(srcK, kg_fertK, FERT[srcK].precioUSD);
    if (urea_kg_ha>0) add("Urea", urea_kg_ha, FERT.Urea.precioUSD);

    if (enm.cal_t_ha>0){
      const kg = enm.cal_t_ha * 1000;
      add("Cal Agrícola", kg, FERT["Cal Agrícola"].precioUSD);
    }
    if (enm.s_t_ha>0){
      const kg = enm.s_t_ha * 1000;
      add("Azufre", kg, FERT.Azufre.precioUSD);
    }

    // Totales
    const sum_ha = items.reduce((a,b)=>a+b.costo_ha,0);
    const sum_total = items.reduce((a,b)=>a+b.costo_total,0);

    return { items, sum_ha, sum_total, rate, moneda };
  }

  // ----------------------------
  // Textos de salida
  // ----------------------------
  // Recomendación de Fertilización
  function renderFertText(cultivo, v, PK, Nfin) {
    return `
      <div style="margin-bottom:18px;">
        <h3 style="color:var(--accent);font-size:1.15rem;margin-bottom:10px;">📌 Recomendación de Fertilización</h3>
        <ul style="margin:0 0 0 18px;padding:0;list-style:square;">
          <li style="margin-bottom:10px;">
            <b>MAP/DAP</b> <span style="color:var(--muted);">(Fósforo)</span><br>
            <span style="color:var(--text);font-size:1.05em;">
              Dosis: <b>${fmt1(PK.kg_fertP)}</b> kg/ha<br>
              <span style="color:var(--muted);font-size:.97em;">
                Se recomienda aplicar para corregir el déficit de fósforo en el suelo y aportar nitrógeno inicial.
              </span>
            </span>
          </li>
          <li style="margin-bottom:10px;">
            <b>KCl</b> <span style="color:var(--muted);">(Potasio)</span><br>
            <span style="color:var(--text);font-size:1.05em;">
              Dosis: <b>${fmt1(PK.kg_fertK)}</b> kg/ha<br>
              <span style="color:var(--muted);font-size:.97em;">
                Corrige el déficit de potasio, esencial para el desarrollo y llenado de grano/fruto.
              </span>
            </span>
          </li>
          <li>
            <b>Urea</b> <span style="color:var(--muted);">(Nitrógeno)</span><br>
            <span style="color:var(--text);font-size:1.05em;">
              Dosis: <b>${fmt1(Nfin.urea_kg_ha)}</b> kg/ha<br>
              <span style="color:var(--muted);font-size:.97em;">
                Completa el requerimiento de nitrógeno del cultivo, ajustando por el N aportado por MAP/DAP y la materia orgánica.
              </span>
            </span>
          </li>
        </ul>
      </div>
    `;
  }

  // Recomendación de Enmiendas
  function renderLimeText(ph, mo, ca, mg, ENM) {
    let texto = `<div style="margin-bottom:18px;">
      <h3 style="color:var(--accent-2);font-size:1.15rem;margin-bottom:10px;">🌱 Recomendación de Enmiendas</h3>
      <ul style="margin:0 0 0 18px;padding:0;list-style:square;">`;

    if (ENM.cal_t_ha > 0) {
      texto += `
        <li>
          <b>Cal Agrícola</b> <span style="color:var(--muted);">(CaCO₃)</span><br>
          Dosis sugerida: <b>${fmt2(ENM.cal_t_ha)}</b> t/ha<br>
          <span style="color:var(--muted);font-size:.97em;">
            El pH ácido (${fmt2(ph)}) requiere corrección. Se recomienda aplicar cal agrícola para neutralizar la acidez y mejorar la disponibilidad de nutrientes.
          </span>
        </li>`;
    } else if (ENM.s_t_ha > 0) {
      texto += `
        <li>
          <b>Azufre elemental</b><br>
          Dosis sugerida: <b>${fmt2(ENM.s_t_ha)}</b> t/ha<br>
          <span style="color:var(--muted);font-size:.97em;">
            El pH alcalino (${fmt2(ph)}) sugiere aplicar azufre para acidificar el suelo y mejorar la absorción de micronutrientes.
          </span>
        </li>`;
    } else {
      texto += `
        <li>
          <b>No se requieren enmiendas</b><br>
          <span style="color:var(--muted);font-size:.97em;">
            El pH del suelo es adecuado para el cultivo seleccionado.
          </span>
        </li>`;
    }
    texto += `</ul></div>`;
    return texto;
  }

  // Costos estimados
  function renderCostosText(cost, moneda) {
    return `
      <div style="margin-bottom:18px;">
        <h3 style="color:#bfa13a;font-size:1.15rem;margin-bottom:10px;">💲 Costos Estimados</h3>
        <table style="width:100%;border-collapse:separate;border-spacing:0 8px;font-size:1em;">
          <thead>
            <tr style="background:rgba(191,161,58,0.08);color:#bfa13a;">
              <th style="text-align:left;padding:6px 8px;">Fertilizante</th>
              <th style="text-align:right;padding:6px 8px;">Dosis (kg/ha)</th>
              <th style="text-align:right;padding:6px 8px;">Precio unitario</th>
              <th style="text-align:right;padding:6px 8px;">Costo (por ha)</th>
            </tr>
          </thead>
          <tbody>
            ${cost.items.map(item => `
              <tr>
                <td style="padding:6px 8px;">${item.name}</td>
                <td style="text-align:right;padding:6px 8px;">${fmt1(item.kg_ha)}</td>
                <td style="text-align:right;padding:6px 8px;">${fmtMoneda(item.costo_ha_usd / item.kg_ha, moneda)}</td>
                <td style="text-align:right;padding:6px 8px;">${fmtMoneda(item.costo_ha, moneda)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:rgba(191,161,58,0.10);font-weight:700;">
              <td colspan="3" style="text-align:right;padding:6px 8px;">Costo total estimado/ha</td>
              <td style="text-align:right;padding:6px 8px;color:#bfa13a;font-size:1.08em;">
                ${fmtMoneda(cost.sum_ha, moneda)}
              </td>
            </tr>
            <tr style="background:rgba(191,161,58,0.10);font-weight:700;">
              <td colspan="3" style="text-align:right;padding:6px 8px;">Costo total estimado (${fmt1(cost.moneda==="COP"?cost.sum_total/cost.rate:cost.sum_total)} ha)</td>
              <td style="text-align:right;padding:6px 8px;color:#bfa13a;font-size:1.08em;">
                ${fmtMoneda(cost.sum_total, moneda)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Calendario y manejo
  function renderCalendarioText(cultivoKey, srcP, srcK) {
    const cal = CAL[cultivoKey];
    return `
      <div style="margin-bottom:18px;">
        <h3 style="color:#7c8b7a;font-size:1.15rem;margin-bottom:10px;">📅 Calendario y Manejo</h3>
        <ol style="margin:0 0 0 18px;padding:0;">
          <li style="margin-bottom:10px;">
            <b>Etapa de siembra:</b> Aplicar <span style="color:var(--accent);">fósforo (${srcP})</span> y <span style="color:var(--accent);">potasio (${srcK})</span> según dosis recomendada. ${cal.P}
          </li>
          <li style="margin-bottom:10px;">
            <b>Etapa de crecimiento:</b> Fraccionar la aplicación de <span style="color:var(--accent);">nitrógeno (urea)</span>. ${cal.N}
            <div style="color:var(--warn);font-size:.97em;margin-top:4px;">
              ⚠️ La urea es volátil: fracciona en 2-3 aplicaciones y riega o incorpora para reducir pérdidas.
            </div>
          </li>
          <li>
            <b>Etapa de desarrollo:</b> Aplicar <span style="color:var(--accent);">potasio</span> según necesidades del cultivo. ${cal.K}
          </li>
        </ol>
      </div>
    `;
  }

  // ----------------------------
  // Función principal
  // ----------------------------
  function calcularRecomendacion(){
    const outF = document.getElementById("fertOut");
    const outL = document.getElementById("limeOut");
    const outC = document.getElementById("costOut");
    const outCal= document.getElementById("calendarOut");

    try{
      const v = validarEntradas();
      if (!v.ok){
        const msg = "Corrige los siguientes campos: " + v.errs.join(", ");
        outF.textContent = msg; outL.textContent = msg; outC.textContent = msg; outCal.textContent = msg;
        document.getElementById("kpiPh").textContent = "—";
        document.getElementById("kpiPhMsg").textContent = "Entrada inválida.";
        document.getElementById("kpiNPK").textContent = "—";
        document.getElementById("kpiProd").textContent = "—";
        return;
      }

      const cultivo = document.getElementById("cultivo").value;
      const srcP = document.getElementById("srcP").value;
      const srcK = document.getElementById("srcK").value;
      const moneda = document.getElementById("moneda").value;

      // 1) P y K primero
      const PK = calcularPK(cultivo, v.p_ppm, v.k_ppm, srcP, srcK);

      // 2) N final descontando N de MAP/DAP y aportes de MO
      const Nfin = calcularNfinal(cultivo, v.mo, PK.N_from_P);

      // 3) Enmiendas
      const ENM = calcularEnmiendas(v.ph, v.mo, v.ca, v.mg);

      // 4) KPIs superiores
      const phDiag = diagnosticoPh(v.ph);
      document.getElementById("kpiPh").textContent = `${fmt2(v.ph)} pH`;
      document.getElementById("kpiPhMsg").innerHTML = phDiag.tag;
      document.getElementById("kpiNPK").textContent =
        `${fmt1(Nfin.N_fert)} – ${fmt1(PK.req_P2O5)} – ${fmt1(PK.req_K2O)}`;
      document.getElementById("kpiProd").textContent =
        `${srcP} ${fmt1(PK.kg_fertP)} | ${srcK} ${fmt1(PK.kg_fertK)} | Urea ${fmt1(Nfin.urea_kg_ha)}`;

      // 5) Costos
      const COST = costos(PK.kg_fertP, srcP, PK.kg_fertK, srcK, Nfin.urea_kg_ha, ENM, v.area, moneda);

      // 6) Render salidas
      document.getElementById("fertOut").innerHTML = renderFertText(cultivo, v, PK, Nfin);
      document.getElementById("limeOut").innerHTML = renderLimeText(v.ph, v.mo, v.ca, v.mg, ENM);
      document.getElementById("costOut").innerHTML = renderCostosText(COST, moneda);
      document.getElementById("calendarOut").innerHTML = renderCalendarioText(cultivo, srcP, srcK);

    }catch(err){
      console.error(err);
      const msg = "Ha ocurrido un error inesperado. Revisa los datos e intenta de nuevo.";
      document.getElementById("fertOut").textContent = msg;
      document.getElementById("limeOut").textContent = msg;
      document.getElementById("costOut").textContent = msg;
      document.getElementById("calendarOut").textContent = msg;
    }
  }

  // ----------------------------
  // UI: eventos
  // ----------------------------
  document.getElementById("btnCalc").addEventListener("click", calcularRecomendacion);
  document.getElementById("btnReset").addEventListener("click", ()=>{
    for (const id of ["ph","mo","p_ppm","k_ppm","ca","mg","area"]){ document.getElementById(id).value = ""; }
    document.getElementById("cultivo").value = "maiz";
    document.getElementById("srcP").value = "MAP";
    document.getElementById("srcK").value = "KCl";
    document.getElementById("moneda").value = "USD";
    document.getElementById("kpiPh").textContent = "—";
    document.getElementById("kpiPhMsg").textContent = "Ingrese datos y calcule.";
    document.getElementById("kpiNPK").textContent = "—";
    document.getElementById("kpiProd").textContent = "—";
    document.getElementById("fertOut").textContent = "Esperando datos…";
    document.getElementById("limeOut").textContent = "Esperando datos…";
    document.getElementById("costOut").textContent = "Esperando datos…";
    document.getElementById("calendarOut").textContent = "Esperando datos…";
  });

  // Demo con datos realistas
  document.getElementById("btnDemo").addEventListener("click", ()=>{
    const set = (id, v)=> document.getElementById(id).value = v;
    set("ph", 5.6);
    set("mo", 3.2);
    set("p_ppm", 12);
    set("k_ppm", 180);
    set("ca", 8.5);
    set("mg", 2.1);
    set("area", 5);
    document.getElementById("cultivo").value = "maiz";
    document.getElementById("srcP").value = "MAP";  // prueba con DAP para ver el descuento de N
    document.getElementById("srcK").value = "KCl";
    document.getElementById("moneda").value = "USD";
    calcularRecomendacion();
  });