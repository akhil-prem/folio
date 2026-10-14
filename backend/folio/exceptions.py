from rest_framework.views import exception_handler


def _flatten(data):
    if data is None:
        return 'Request failed'
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        return _flatten(data[0]) if data else 'Request failed'
    if isinstance(data, dict):
        if isinstance(data.get('error'), str):
            return data['error']
        parts = []
        for key, value in data.items():
            message = _flatten(value)
            if key in {'detail', 'non_field_errors', 'error'}:
                parts.append(message)
            else:
                parts.append(f'{key}: {message}')
        return '; '.join(parts) or 'Request failed'
    return str(data)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    response.data = {'error': _flatten(response.data)}
    return response
