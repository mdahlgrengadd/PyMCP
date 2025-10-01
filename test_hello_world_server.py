"""
Test Suite for Hello World MCP Server

This file demonstrates how to test all features of the Hello World server:
- Tools testing
- Resources testing  
- Prompts testing
- Error handling testing

Run this to verify the server works correctly.
"""

import json
from hello_world_server import HelloWorldService


def test_tools():
    """Test all tools with valid and invalid inputs"""
    print("🧪 Testing Tools...")

    service = HelloWorldService()

    # Test greet tool
    print("\n📝 Testing greet tool:")

    # Valid input
    result = service.greet("Alice")
    print(f"✅ greet('Alice'): {result}")
    assert "message" in result
    assert "Hello Alice!" in result["message"]

    # Empty input
    result = service.greet("")
    print(f"✅ greet(''): {result}")
    assert "error" in result

    # Whitespace input
    result = service.greet("   ")
    print(f"✅ greet('   '): {result}")
    assert "error" in result

    # Test calculate tool
    print("\n🧮 Testing calculate tool:")

    # Valid operations
    result = service.calculate("add", 5, 3)
    print(f"✅ calculate('add', 5, 3): {result}")
    assert result["result"] == 8
    assert "5 + 3 = 8" in result["expression"]

    result = service.calculate("multiply", 4, 7)
    print(f"✅ calculate('multiply', 4, 7): {result}")
    assert result["result"] == 28

    result = service.calculate("divide", 15, 3)
    print(f"✅ calculate('divide', 15, 3): {result}")
    assert result["result"] == 5.0

    # Division by zero
    result = service.calculate("divide", 10, 0)
    print(f"✅ calculate('divide', 10, 0): {result}")
    assert "error" in result
    assert "Cannot divide by zero" in result["error"]

    # Test echo tool
    print("\n📢 Testing echo tool:")

    # Valid input
    result = service.echo("Hello World")
    print(f"✅ echo('Hello World'): {result}")
    assert result["echo"] == "Hello World"
    assert result["word_count"] == 2
    assert result["original_length"] == 11

    # Whitespace input
    result = service.echo("   spaced   text   ")
    print(f"✅ echo('   spaced   text   '): {result}")
    assert result["echo"] == "spaced text"
    assert result["word_count"] == 2

    # Empty input
    result = service.echo("")
    print(f"✅ echo(''): {result}")
    assert "error" in result

    print("✅ All tools tests passed!")


def test_resources():
    """Test all resources"""
    print("\n📚 Testing Resources...")

    service = HelloWorldService()

    # Test getting_started resource
    result = service.resource_getting_started()
    print(f"✅ resource_getting_started(): {type(result)}")
    assert "mimeType" in result
    assert "text" in result
    assert result["mimeType"] == "application/json"

    # Parse and verify content
    content = json.loads(result["text"])
    assert "title" in content
    assert "content" in content
    assert "Getting Started" in content["title"]

    # Test examples resource
    result = service.resource_examples()
    print(f"✅ resource_examples(): {type(result)}")
    assert "mimeType" in result
    assert "text" in result

    content = json.loads(result["text"])
    assert "examples" in content["title"]

    # Test api_reference resource
    result = service.resource_api_reference()
    print(f"✅ resource_api_reference(): {type(result)}")
    assert "mimeType" in result
    assert "text" in result

    content = json.loads(result["text"])
    assert "API Reference" in content["title"]

    print("✅ All resources tests passed!")


def test_prompts():
    """Test all prompts"""
    print("\n🎯 Testing Prompts...")

    service = HelloWorldService()

    # Test conversation_starter prompt
    result = service.prompt_conversation_starter()
    print(f"✅ prompt_conversation_starter(): {type(result)}")
    assert "description" in result
    assert "messages" in result
    assert len(result["messages"]) == 1
    assert result["messages"][0]["role"] == "system"
    assert "friendly assistant" in result["messages"][0]["content"]

    # Test calculator_guide prompt
    result = service.prompt_calculator_guide()
    print(f"✅ prompt_calculator_guide(): {type(result)}")
    assert "description" in result
    assert "messages" in result
    assert "math assistant" in result["messages"][0]["content"]

    # Test echo_tester prompt
    result = service.prompt_echo_tester()
    print(f"✅ prompt_echo_tester(): {type(result)}")
    assert "description" in result
    assert "messages" in result
    assert "text processing" in result["messages"][0]["content"]

    print("✅ All prompts tests passed!")


def test_server_info():
    """Test server metadata"""
    print("\n📊 Testing Server Info...")

    from hello_world_server import SERVER_INFO

    assert SERVER_INFO["name"] == "Hello World MCP Server"
    assert SERVER_INFO["version"] == "1.0.0"
    assert SERVER_INFO["features"]["tools"] == 3
    assert SERVER_INFO["features"]["resources"] == 3
    assert SERVER_INFO["features"]["prompts"] == 3
    assert SERVER_INFO["features"]["total_endpoints"] == 9

    print(f"✅ Server Info: {SERVER_INFO['name']} v{SERVER_INFO['version']}")
    print(
        f"✅ Features: {SERVER_INFO['features']['tools']} tools, {SERVER_INFO['features']['resources']} resources, {SERVER_INFO['features']['prompts']} prompts")


def run_all_tests():
    """Run all tests"""
    print("🚀 Starting Hello World MCP Server Test Suite")
    print("=" * 50)

    try:
        test_tools()
        test_resources()
        test_prompts()
        test_server_info()

        print("\n" + "=" * 50)
        print("🎉 ALL TESTS PASSED!")
        print("✅ Hello World MCP Server is working correctly")
        print("🚀 Ready for production use!")

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        raise


if __name__ == "__main__":
    run_all_tests()
