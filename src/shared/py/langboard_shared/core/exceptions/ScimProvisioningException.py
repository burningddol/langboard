class ScimProvisioningException:
    class Default(Exception):
        pass

    class InvalidRequest(Default):
        pass

    class Conflict(Default):
        pass

    class Unavailable(Default):
        pass
