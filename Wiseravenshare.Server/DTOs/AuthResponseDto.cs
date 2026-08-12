using System;

namespace Wiseravenshare.DTOs
{
    public class AuthResponseDto
    {
        public Guid UserId { get; set; }
        public string Username { get; set; }
        public string Email { get; set; }
        public string AccessToken { get; set; }
        public string RefreshToken { get; set; }
        public DateTime TokenExpiration { get; set; }
        public string Message { get; set; }
    }
}