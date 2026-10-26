/* MyLogisticsERP status page: 90-day uptime bars, plain status labels, banner and footer.
   Upptime renders the page client-side, so a MutationObserver re-applies this whenever
   its components mount (first load and after in-app navigation). */
(function () {
  if (window.__mspStatusPage) return;
  window.__mspStatusPage = true;

  var OWNER = 'abnxtgen';
  var REPO = 'mylogisticserp-status';
  var HISTORY = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/master/history/';
  var DAYS = 90;
  var DAY_MS = 86400000;
  var LEGAL_NAME = 'AB NXTGEN Technologies Pvt Ltd';

  var STATE_LABELS = {
    up: 'Operational',
    degraded: 'Degraded performance',
    down: 'Major outage'
  };

  var dataPromise = null;

  // summary.json carries dailyMinutesDown per UTC day; each site's history file has its startTime.
  function loadSites() {
    if (!dataPromise) {
      dataPromise = fetch(HISTORY + 'summary.json')
        .then(function (res) {
          return res.json();
        })
        .then(function (sites) {
          return Promise.all(
            sites.map(function (site) {
              return fetch(HISTORY + site.slug + '.yml')
                .then(function (res) {
                  return res.text();
                })
                .then(function (yml) {
                  var match = yml.match(/^startTime:\s*(\S+)/m);
                  site.startTime = match ? new Date(match[1]) : null;
                  return site;
                })
                .catch(function () {
                  site.startTime = null;
                  return site;
                });
            })
          );
        });
      dataPromise.catch(function () {
        dataPromise = null;
      });
    }
    return dataPromise;
  }

  function startOfUtcDay(date) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function dayKey(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function formatDay(ms) {
    return new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function buildDays(site) {
    var now = new Date();
    var today = startOfUtcDay(now);
    var firstDay = site.startTime ? startOfUtcDay(site.startTime) : today;
    var downByDay = site.dailyMinutesDown || {};
    var days = [];
    var downMinutes = 0;

    for (var i = DAYS - 1; i >= 0; i--) {
      var ms = today - i * DAY_MS;
      var minutes = downByDay[dayKey(ms)] || 0;
      var state;
      if (ms < firstDay) state = 'nodata';
      else if (minutes === 0) state = 'up';
      else if (minutes < 60) state = 'partial';
      else state = 'down';
      if (state !== 'nodata') downMinutes += minutes;
      days.push({ ms: ms, minutes: minutes, state: state });
    }

    var windowStart = Math.max(today - (DAYS - 1) * DAY_MS, site.startTime ? site.startTime.getTime() : now.getTime());
    var monitoredMinutes = Math.max((now.getTime() - windowStart) / 60000, 1);
    var uptime = Math.max(0, 100 - (downMinutes / monitoredMinutes) * 100);
    // Floor so a short outage never rounds up to a perfect 100%.
    uptime = Math.floor(uptime * 100) / 100;

    return { days: days, uptime: uptime === 100 ? '100' : uptime.toFixed(2) };
  }

  function dayTooltip(day) {
    var detail;
    if (day.state === 'nodata') detail = 'No data';
    else if (day.minutes === 0) detail = 'No downtime';
    else detail = day.minutes + ' min down';
    return formatDay(day.ms) + '\n' + detail;
  }

  var tip = null;

  function showTip(bar) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'msp-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    var rect = bar.getBoundingClientRect();
    tip.textContent = '';
    bar.getAttribute('data-tip').split('\n').forEach(function (line, index) {
      if (index) tip.appendChild(document.createElement('br'));
      tip.appendChild(document.createTextNode(line));
    });
    tip.hidden = false;
    var half = tip.offsetWidth / 2 + 8;
    var x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    tip.style.left = x + 'px';
    tip.style.top = rect.top + 'px';
  }

  function hideTip() {
    if (tip) tip.hidden = true;
  }

  function enhanceSite(article, site) {
    var heading = article.querySelector('h4');
    if (!heading) return;

    var state = document.createElement('span');
    state.className = 'msp-state ' + site.status;
    state.textContent = STATE_LABELS[site.status] || site.status;
    heading.appendChild(state);

    var result = buildDays(site);
    var bars = document.createElement('div');
    bars.className = 'msp-bars';
    bars.setAttribute('aria-label', 'Daily uptime for the last ' + DAYS + ' days');
    result.days.forEach(function (day) {
      var bar = document.createElement('span');
      bar.className = day.state;
      bar.setAttribute('data-tip', dayTooltip(day));
      bar.setAttribute('tabindex', '0');
      bar.setAttribute('aria-label', dayTooltip(day).replace('\n', ': '));
      bar.addEventListener('mouseenter', function () {
        showTip(bar);
      });
      bar.addEventListener('focus', function () {
        showTip(bar);
      });
      bar.addEventListener('mouseleave', hideTip);
      bar.addEventListener('blur', hideTip);
      bars.appendChild(bar);
    });

    var legend = document.createElement('div');
    legend.className = 'msp-legend';
    legend.innerHTML =
      '<span><span class="msp-long">' + DAYS + ' days ago</span><span class="msp-short">30 days ago</span></span>' +
      '<span>' + result.uptime + '% uptime</span>' +
      '<span>Today</span>';

    article.appendChild(bars);
    article.appendChild(legend);
  }

  function enhanceLiveStatus(section) {
    var articles = section.querySelectorAll('article');
    if (!articles.length || section.getAttribute('data-msp') === 'pending') return;

    var header = section.previousElementSibling;
    if (header && header.tagName === 'DIV') header.classList.add('msp-hidden');

    section.setAttribute('data-msp', 'pending');
    loadSites()
      .then(function (sites) {
        Array.prototype.forEach.call(section.querySelectorAll('article'), function (article) {
          if (article.getAttribute('data-msp')) return;
          var link = article.querySelector('h4 a');
          var slug = link ? link.getAttribute('href').split('/').pop() : null;
          var site = sites.filter(function (s) {
            return s.slug === slug;
          })[0];
          if (!site) return;
          article.setAttribute('data-msp', 'done');
          enhanceSite(article, site);
        });
        section.setAttribute('data-msp', 'done');
      })
      .catch(function () {
        section.removeAttribute('data-msp');
      });
  }

  function enhanceBanner(banner) {
    if (banner.getAttribute('data-msp')) return;
    banner.setAttribute('data-msp', 'done');
    banner.innerHTML =
      '<svg class="msp-check" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="11" fill="#ffffff" fill-opacity="0.22"/>' +
      '<path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg><span>All systems operational</span>';
  }

  function enhanceFooter(footer) {
    var text = footer.querySelector('p');
    if (!text || text.getAttribute('data-msp')) return;
    text.setAttribute('data-msp', 'done');
    text.textContent = '© ' + new Date().getFullYear() + ' ' + LEGAL_NAME;
  }

  function apply() {
    var section = document.querySelector('main section.live-status');
    if (section && section.getAttribute('data-msp') !== 'done') enhanceLiveStatus(section);

    var banner = document.querySelector('main > article.up');
    if (banner) enhanceBanner(banner);

    var footer = document.querySelector('#sapper footer');
    if (footer) enhanceFooter(footer);
  }

  function start() {
    apply();
    new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
