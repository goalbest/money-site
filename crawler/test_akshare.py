import akshare as ak

# 查看 akshare 所有函数名里跟"银行/理财"相关的
funcs = [name for name in dir(ak) if "bank" in name.lower() or "finance" in name.lower() or "wealth" in name.lower()]
print("相关函数：")
for f in funcs:
    print(" -", f)