# Spreadsheet Mapping

Legacy reference files:

- Salinan dari 0. CATATAN KEUANGAN KANTIN
- Salinan dari CATATAN Petugas KANTIN
- Salinan Catatan simpanan Uang

Normalized destination sheets:

- `users`
- `transactions`
- `savings`
- `suppliers`
- `sessions`

Mapping rules:

- One transaction row represents one sold item entry.
- One transaction row belongs to one input user.
- Legacy multi-name cells are documentation only and should not be preserved as the new write shape.
- User emails must be cleaned during manual seed.
- Savings rows should use clean numeric columns for deposit and balance.

