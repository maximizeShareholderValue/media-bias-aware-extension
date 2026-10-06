/** Minimal RFC-4180 CSV reader/writer for the validation sheet (quotes, commas, newlines). */
"use strict";

function escapeCell(v) {
  var s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function stringify(rows) {
  return rows
    .map(function (r) {
      return r.map(escapeCell).join(",");
    })
    .join("\r\n") + "\r\n";
}

function parse(text) {
  var rows = [];
  var row = [];
  var cell = "";
  var inQuotes = false;
  text = text.replace(/^﻿/, "");
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(function (r) {
    return r.length > 1 || (r.length === 1 && r[0] !== "");
  });
}

module.exports = { stringify: stringify, parse: parse };
