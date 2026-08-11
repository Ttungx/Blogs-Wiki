-- 受控分类是 articles 写入的外键前置条件。
-- OR IGNORE 使新环境与已有人手数据的环境都可重复应用。
INSERT OR IGNORE INTO categories (name, sort_order) VALUES
  ('AI', 10),
  ('Agent', 20),
  ('AI Coding / Developer Tools', 30),
  ('Research', 40),
  ('Engineering / Infrastructure', 50),
  ('Internet / Technology', 60),
  ('Personal Growth', 70),
  ('Other', 80);
