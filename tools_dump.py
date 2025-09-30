import json, sys, os
sys.path.insert(0, os.path.join('src','py'))
from my_server import MyService

if __name__ == "__main__":
    svc = MyService()
    print(json.dumps({"tools": svc._tools_list()}))
