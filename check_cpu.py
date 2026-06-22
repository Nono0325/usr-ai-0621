import requests

username = '41243168'
token = 'b02870d0d37bcda14dbbd1fc42eee1fa65b0871e'

response = requests.get(
    'https://www.pythonanywhere.com/api/v0/user/{username}/cpu/'.format(
        username=username
    ),
    headers={'Authorization': 'Token {token}'.format(token=token)}
)

if response.status_code == 200:
    print('CPU quota info:')
    print(response.content.decode('utf-8'))
else:
    print('Got unexpected status code {}: {!r}'.format(response.status_code, response.content))
